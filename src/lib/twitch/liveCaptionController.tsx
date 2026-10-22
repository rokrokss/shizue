import { MESSAGE_SCC_SET_HIDDEN, STORAGE_TWITCH_CHANNEL_LANGUAGE } from '@/config/constants';
import {
  CaptionSettings,
  CaptionStatus as LiveCaptionStatus,
  LiveCaptionController,
  LiveCaptionPlatform,
} from '@/lib/liveCaption/liveCaptionController';
import { speechLanguageForTwitchCode } from '@/lib/liveCaption/speechLanguage';
import type { LiveCaptionMetadata } from '@/lib/prompts';
import {
  BRIDGE_TO_CONTENT_EVENT,
  CONTENT_TO_BRIDGE_EVENT,
  parseBridgeMessage,
} from '@/lib/twitch/bridgeProtocol';
import { CaptionPrefetch, chunkKey, createCaptionPrefetch } from '@/lib/twitch/captionPrefetch';

// Twitch's side of the live captions (lib/liveCaption/liveCaptionController.tsx). The original
// text comes from the streamer's CEA-608 captions (PlayerTextCue), the Stream Closed Captioner
// extension's frame, or speech recognition on the stream's audio.
type TwitchCaptionSource = 'cea608' | 'scc';
export type CaptionSource = TwitchCaptionSource | 'stt';
export type CaptionStatus = LiveCaptionStatus<TwitchCaptionSource>;
export type { CaptionSettings };

const OVERLAY_HOST_ID = 'shizue-twitch-caption-overlay';
// Twitch's ad label and countdown over the player (as of 2026-10, per Purple-adblock's findings).
const AD_SELECTOR = '[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"]';

export const isTwitchVod = () => location.pathname.startsWith('/videos/');

const playerVideo = () =>
  document.querySelector<HTMLVideoElement>('.video-player__container video') ??
  document.querySelector('video');

const channelLogin = () => (isTwitchVod() ? null : location.pathname.split('/')[1] || null);

const streamMetadata = (): LiveCaptionMetadata => ({
  title:
    document.querySelector('[data-a-target="stream-title"]')?.textContent?.trim() ||
    document.title,
  category: document.querySelector('[data-a-target="stream-game-link"]')?.textContent?.trim(),
  channel: isTwitchVod() ? undefined : location.pathname.split('/')[1],
});

// Our overlay shows SCC's text, so its own captions on the video would be shown twice.
const setSccCaptionsHidden = (hidden: boolean) => {
  void chrome.runtime.sendMessage({ action: MESSAGE_SCC_SET_HIDDEN, hidden }).catch(() => {});
};

const requestLanguage = () => {
  languageRequestedAt = Date.now();
  window.dispatchEvent(
    new CustomEvent(CONTENT_TO_BRIDGE_EVENT, { detail: JSON.stringify({ type: 'language' }) })
  );
};

let instance: LiveCaptionController<TwitchCaptionSource> | null = null;
// Broadcaster captions read ahead of playback from the player's buffered video.
let prefetch: CaptionPrefetch | null = null;
// The page whose broadcast language is known.
let languagePath: string | null = null;
let languageRequestedAt = 0;

// Lets the read-ahead captions know how far the player has buffered (see advance()).
const advancePrefetch = () => {
  const video = playerVideo();
  if (!prefetch || instance?.source !== 'cea608' || !video) return;
  const { buffered, currentTime } = video;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
      prefetch.advance(buffered.end(i));
    }
  }
};

const platform: LiveCaptionPlatform<TwitchCaptionSource> = {
  name: 'Twitch',
  // Captions the streamer provides beat recognizing the stream's audio, which also hears game
  // sound and music.
  captionSources: () => ['cea608', 'scc'],
  video: playerVideo,
  overlayParent: () => document.querySelector<HTMLElement>('.video-player__container'),
  createOverlay: (parent) => {
    // Inline styles: this element sits in Twitch's DOM, outside our stylesheet.
    const host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    Object.assign(host.style, {
      position: 'absolute',
      left: '50%',
      bottom: '12%',
      transform: 'translateX(-50%)',
      width: 'max-content',
      maxWidth: '90%',
      textAlign: 'center',
      pointerEvents: 'none',
      zIndex: '2',
    });
    host.dir = 'ltr';
    parent.append(host);
    return { element: host, shadowHost: host };
  },
  // Twitch recreates the caption box between cues.
  hideNativeCaptionsCss: '.player-captions-container { visibility: hidden !important; }',
  pageKey: () => location.pathname,
  channelKey: channelLogin,
  channelLanguageStorageKey: STORAGE_TWITCH_CHANNEL_LANGUAGE,
  metadata: streamMetadata,
  isAdPlaying: () => !!document.querySelector(AD_SELECTOR),
  allowCloudSpeech: true,
  // Stream Closed Captioner shows the words being spoken and rewrites them a moment later when
  // its recognizer finalizes them; committing on a short pause would keep the first wording and
  // repeat the rest. Give it longer to settle.
  pauseMs: (source) => (source === 'scc' ? 3000 : 1500),
  onSourceChange: (from, to) => {
    if (from === 'scc' || to === 'scc') setSccCaptionsHidden(to === 'scc');
  },
  onPageChange: requestLanguage,
  createReadAhead: ({ translate, onTranslation, onChunk }) => {
    const current = createCaptionPrefetch({
      translate,
      onTranslation,
      onChunk,
      position: () => playerVideo()?.currentTime ?? null,
    });
    prefetch = current;
    return {
      isComplete: (text) => current.isComplete(text),
      chunk: (text) => current.chunk(text),
      key: chunkKey,
      tick: advancePrefetch,
      reset: (navigation) => current.reset(navigation),
      dispose: () => {
        current.dispose();
        if (prefetch === current) prefetch = null;
      },
    };
  },
};

const createTwitchLiveCaptions = () => {
  const controller = new LiveCaptionController(platform);
  window.addEventListener(BRIDGE_TO_CONTENT_EVENT, (event) => {
    const message = parseBridgeMessage((event as CustomEvent).detail);
    if (!message) return;
    if (message.type === 'cue') controller.handleCaptions('cea608', message.text.replace(/\r\n/g, ' '));
    else if (message.type === 'seeked') controller.restart('seeked');
    else if (message.type === 'captionData') {
      // CEA-608 pairs from the player's buffered video (twitch-player-worker.content).
      const video = playerVideo();
      if (prefetch && controller.source === 'cea608' && video) prefetch.add(message.pairs, video.currentTime);
    } else if (message.type === 'state') controller.handlePlayerState(message.paused);
    else if (message.type === 'language' && message.path === location.pathname) {
      languagePath = message.path;
      void controller.setDetectedSpeechLanguage(speechLanguageForTwitchCode(message.code), message.login);
    }
  });
  requestLanguage();
  // The bridge can start after this script and miss a request, so ask until it answers.
  setInterval(() => {
    if (languagePath !== location.pathname && Date.now() - languageRequestedAt > 1000) requestLanguage();
  }, 500);
  return controller;
};

export const getTwitchLiveCaptions = () => {
  instance ??= createTwitchLiveCaptions();
  return instance;
};

// Asks the MAIN-world bridge to answer; resolves false when it is not running in this page.
export const pingTwitchBridge = (timeoutMs = 1000): Promise<boolean> =>
  new Promise((resolve) => {
    const onMessage = (event: Event) => {
      if (parseBridgeMessage((event as CustomEvent).detail)?.type !== 'pong') return;
      window.removeEventListener(BRIDGE_TO_CONTENT_EVENT, onMessage);
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      window.removeEventListener(BRIDGE_TO_CONTENT_EVENT, onMessage);
      resolve(false);
    }, timeoutMs);
    window.addEventListener(BRIDGE_TO_CONTENT_EVENT, onMessage);
    window.dispatchEvent(
      new CustomEvent(CONTENT_TO_BRIDGE_EVENT, { detail: JSON.stringify({ type: 'ping' }) })
    );
  });
