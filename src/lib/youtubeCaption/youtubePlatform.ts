import { STORAGE_YOUTUBE_CHANNEL_LANGUAGE } from '@/config/constants';
import { LiveCaptionController, LiveCaptionPlatform } from '@/lib/liveCaption/liveCaptionController';
import { speechLanguageForCode } from '@/lib/liveCaption/speechLanguage';
import type { LiveCaptionMetadata } from '@/lib/prompts';
import { getVideoId, isYoutubeAdPlaying, LiveInfo } from '@/lib/youtube';
import { createLiveCaptionReadAhead } from '@/lib/youtubeCaption/captionReadAhead';
import { joinCaptionLines, readCaptionLines } from '@/lib/youtubeCaption/domCaptionSource';
import {
  CONTENT_TO_HOOK_EVENT,
  HOOK_TO_CONTENT_EVENT,
  HookMessage,
  HookRequest,
  parseHookDetail,
} from '@/lib/youtubeCaption/hookProtocol';
import { NATIVE_CAPTIONS, PLAYER, SUBTITLES_BUTTON, VIDEO } from '@/lib/youtubeCaption/selectors';
import { detectSpokenLanguage } from '@/lib/youtubeCaption/spokenLanguage';

// YouTube's side of the live captions (lib/liveCaption/liveCaptionController.tsx), for live streams
// and videos without caption tracks. Videos with caption tracks keep captionInjector. One controller
// serves one video; YoutubeCaptionToggle creates it only when this path is used and disposes it
// when the viewer leaves the video or goes back to the caption track.

// 'track': the live stream's captions on screen (CEA-608 or YouTube's live recognition).
export type YoutubeCaptionSource = 'track';

export type YoutubeVideo = {
  videoId: string;
  channelId: string | null;
  title: string;
  author: string;
  description: string;
  live?: LiveInfo;
};

const OVERLAY_ID = 'shizue-live-caption';
const READ_MS = 200;

const subtitlesButton = () => document.querySelector<HTMLElement>(SUBTITLES_BUTTON);

// youtube-player-hook.content copies the player's media responses only while this asks it to.
const requestHook = (request: HookRequest) => {
  window.dispatchEvent(new CustomEvent(CONTENT_TO_HOOK_EVENT, { detail: JSON.stringify(request) }));
};

export const youtubeVideoElement = () =>
  document.querySelector<HTMLVideoElement>(VIDEO) ?? document.querySelector('video');

// The live caption track this video's captions can be read from, if any.
export const liveCaptionTrack = (live: LiveInfo | undefined) =>
  live?.isLive && live.normalLatency ? live.captionTrack : undefined;

export const createYoutubeLiveCaptions = (video: YoutubeVideo) => {
  const track = liveCaptionTrack(video.live);
  const metadata: LiveCaptionMetadata = { title: video.title, channel: video.author };
  let readTimer: ReturnType<typeof setInterval> | null = null;
  let lastText = '';
  // Whether we turned YouTube's captions on, so turning ours off puts them back.
  let turnedCaptionsOn = false;
  // The same captions read from the player's responses, ahead of the screen.
  let readAhead: ReturnType<typeof createLiveCaptionReadAhead> | null = null;

  const startReading = () => {
    // YouTube draws live captions only while its captions are on.
    const button = subtitlesButton();
    if (button?.getAttribute('aria-pressed') === 'false') {
      button.click();
      turnedCaptionsOn = true;
    }
    lastText = '';
    requestHook({ type: 'captions', on: true });
    readTimer ??= setInterval(() => {
      // An ad's own captions can show in the same box.
      if (isYoutubeAdPlaying()) return;
      const text = joinCaptionLines(readCaptionLines(document.querySelector(NATIVE_CAPTIONS)), track?.kind === 'asr');
      if (text === lastText) return;
      lastText = text;
      controller.handleCaptions('track', text);
    }, READ_MS);
  };

  const stopReading = () => {
    if (readTimer) clearInterval(readTimer);
    readTimer = null;
    requestHook({ type: 'captions', on: false });
    const button = subtitlesButton();
    if (turnedCaptionsOn && button?.getAttribute('aria-pressed') === 'true') button.click();
    turnedCaptionsOn = false;
  };

  const platform: LiveCaptionPlatform<YoutubeCaptionSource> = {
    name: 'YouTube',
    captionSources: () => (track ? ['track'] : []),
    video: youtubeVideoElement,
    live: () => !!video.live?.isLive,
    overlayParent: () => document.querySelector<HTMLElement>(PLAYER),
    createOverlay: (parent) => {
      // The same boxes captionInjector uses, so YouTube's CSS moves the captions above the controls.
      const container = document.createElement('div');
      container.id = OVERLAY_ID;
      container.className = 'ytp-caption-window-container';
      const windowBottom = document.createElement('div');
      windowBottom.className = 'caption-window ytp-caption-window-bottom';
      Object.assign(windowBottom.style, {
        bottom: '2%',
        textAlign: 'center',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: '90%',
      });
      const shadowHost = document.createElement('div');
      shadowHost.dir = 'ltr';
      shadowHost.style.display = 'contents';
      windowBottom.append(shadowHost);
      container.append(windowBottom);
      parent.append(container);
      return { element: container, shadowHost };
    },
    // visibility, not display: YouTube keeps drawing the captions we read.
    hideNativeCaptionsCss: `${NATIVE_CAPTIONS} { visibility: hidden !important; }`,
    pageKey: () => getVideoId() ?? '',
    channelKey: () => video.channelId,
    channelLanguageStorageKey: STORAGE_YOUTUBE_CHANNEL_LANGUAGE,
    metadata: () => metadata,
    isAdPlaying: isYoutubeAdPlaying,
    // Only on-device recognition here for now: no audio leaves the device, so no consent is asked.
    allowCloudSpeech: false,
    // YouTube's live recognition replaces two-line blocks every few seconds; CEA-608 rolls up.
    blockCaptions: (source) => source === 'track' && track?.kind === 'asr',
    onSourceChange: (from, to) => {
      if (to === 'track') startReading();
      else if (from === 'track') stopReading();
    },
    createReadAhead: track
      ? (options) => {
          const created = createLiveCaptionReadAhead({
            ...options,
            asr: track.kind === 'asr',
            position: () => youtubeVideoElement()?.currentTime ?? null,
          });
          readAhead = created;
          return {
            ...created.readAhead,
            dispose: () => {
              created.readAhead.dispose();
              if (readAhead === created) readAhead = null;
            },
          };
        }
      : undefined,
  };

  const controller = new LiveCaptionController(platform);
  if (track) controller.markSeen('track');

  const onHookMessage = (event: Event) => {
    const message = parseHookDetail<HookMessage>((event as CustomEvent).detail);
    if (message?.type === 'captions' && controller.source === 'track') readAhead?.add(message.cues);
  };
  window.addEventListener(HOOK_TO_CONTENT_EVENT, onHookMessage);

  const element = youtubeVideoElement();
  // Buffering fires 'waiting', not 'pause', on YouTube, so the element's own state is enough.
  const onPlayState = () => controller.handlePlayerState(!!element?.paused);
  const onSeeked = () => controller.restart('seeked');
  element?.addEventListener('pause', onPlayState);
  element?.addEventListener('play', onPlayState);
  element?.addEventListener('seeked', onSeeked);
  onPlayState();

  // A live caption track names its language; otherwise guess it from the title and description.
  // A language picked for this channel applies right away, without waiting for the guess.
  void controller.setDetectedSpeechLanguage(track ? speechLanguageForCode(track.languageCode) : null);
  if (!track) {
    void detectSpokenLanguage(`${video.title}\n${video.description}`).then((detected) => {
      if (detected) void controller.setDetectedSpeechLanguage(detected);
    });
  }

  return {
    controller,
    dispose: () => {
      controller.dispose();
      stopReading();
      window.removeEventListener(HOOK_TO_CONTENT_EVENT, onHookMessage);
      element?.removeEventListener('pause', onPlayState);
      element?.removeEventListener('play', onPlayState);
      element?.removeEventListener('seeked', onSeeked);
    },
  };
};

export type YoutubeLiveCaptions = ReturnType<typeof createYoutubeLiveCaptions>;
