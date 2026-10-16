import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import { Language } from '@/hooks/language';
import { createSegmenter, Segmenter } from '@/lib/liveCaption/segmenter';
import { createTranslationQueue, TranslationQueue } from '@/lib/liveCaption/translationQueue';
import type { TranslationContext } from '@/lib/liveCaption/types';
import type { LiveCaptionMetadata } from '@/lib/prompts';
import {
  BRIDGE_TO_CONTENT_EVENT,
  CONTENT_TO_BRIDGE_EVENT,
  parseBridgeMessage,
} from '@/lib/twitch/bridgeProtocol';
import { MESSAGE_SCC_SET_HIDDEN, STORAGE_TWITCH_CHANNEL_LANGUAGE } from '@/config/constants';
import {
  isChromeTranslatorPending,
  prepareChromeTranslator,
  translateOnDevice,
} from '@/lib/twitch/chromeTranslator';
import { CaptionPrefetch, chunkKey, createCaptionPrefetch } from '@/lib/twitch/captionPrefetch';
import { speechLanguageForTwitchCode } from '@/lib/twitch/speechLanguage';
import {
  getWebSpeechSource,
  installOnDeviceSpeech,
  isSpeechRecognitionSupported,
  SpeechAvailability,
  speechAvailability,
} from '@/lib/twitch/webSpeechSource';
import { debugLog } from '@/logs';
import { translationService } from '@/services/translationService';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Where the original text comes from: the streamer's CEA-608 captions (PlayerTextCue), the
// Stream Closed Captioner extension's frame, or speech recognition on the stream's audio.
export type CaptionSource = 'cea608' | 'scc' | 'stt';
export type CaptionSourceMode = 'auto' | CaptionSource;

export type CaptionSettings = {
  targetLanguage: Language;
  numLines: number;
  bilingual: boolean;
  captionSizeRatio: number;
};

export type ActivateOptions = CaptionSettings & {
  mode: CaptionSourceMode;
  // The viewer agreed to speech recognition; without it the speech source is never started.
  speechAllowed: boolean;
  // Chrome's on-device translator translates everything; otherwise only the LLM does. A line's
  // translation never changes once shown.
  chromeTranslation: boolean;
};

type Line = { id: string; original: string; translation: string | null | undefined; changedAt: number };

export type CaptionStatus = {
  // Caption sources that produced text on this channel or video, plus 'stt' when supported.
  available: CaptionSource[];
  active: boolean;
  activeSource: CaptionSource | null;
  loading: boolean;
  // The language speech recognition listens for on this channel.
  speechLanguage: string;
  speechError: string | null;
  // Whether that language can be recognized on this device (no audio leaves it).
  onDeviceSpeech: SpeechAvailability;
  // An ad is playing; captions and speech recognition wait, and the button hides as on YouTube.
  adPlaying: boolean;
};

const OVERLAY_HOST_ID = 'shizue-twitch-caption-overlay';
const HIDE_NATIVE_STYLE_ID = 'shizue-twitch-hide-native-captions';
const TICK_MS = 100;
// A line leaves the screen this long after it last changed (shown, then translated), even while
// the speaker keeps talking.
const LINE_LINGER_MS = 6000;
// Chrome translates in milliseconds, so the words still being spoken are translated as they come
// (at most this often), as caption extensions that use Google Translate do. Waiting for a chunk to
// be committed held translations back 2–4 s, and 4–6 s on Stream Closed Captioner.
const LIVE_TRANSLATION_MS = 300;
const LOADING_TIMEOUT_MS = 5000;
// While speech recognition stands in, this many caption updates within the window means the
// streamer's own captions (or Stream Closed Captioner) are running: switch to them.
const UPGRADE_UPDATES = 2;
const UPGRADE_WINDOW_MS = 10_000;
const DEFAULT_SPEECH_LANGUAGE = 'en-US';
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

class TwitchLiveCaptions {
  private settings: CaptionSettings | null = null;
  private mode: CaptionSourceMode = 'auto';
  private speechAllowed = false;
  private chromeTranslation = false;
  // Line IDs stay unique across sources: each new segmenter numbers its sentences from 1.
  private lineSequence = 0;
  private activeSource: CaptionSource | null = null;
  private segmenter: Segmenter | null = null;
  private queue: TranslationQueue | null = null;
  // Broadcaster captions read ahead of playback from the player's buffered video.
  private prefetch: CaptionPrefetch | null = null;
  private lines: Line[] = [];
  private interim = '';
  private interimChangedAt = 0;
  // Chrome's translation of the words still being spoken, and what makes older answers stale.
  private interimTranslation = '';
  private interimGeneration = 0;
  private interimTimer: ReturnType<typeof setTimeout> | null = null;
  private activatedAt = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<CaptionSource>();
  private upgradeUpdates: { source: CaptionSource; at: number }[] = [];
  private loading = false;
  private path = location.pathname;
  private login: string | null = channelLogin();
  private detectedSpeechLanguage: string | null = null;
  // The page whose broadcast language is known.
  private languagePath: string | null = null;
  private languageRequestedAt = 0;
  private speechLanguage = DEFAULT_SPEECH_LANGUAGE;
  private speechError: string | null = null;
  private onDeviceSpeech: SpeechAvailability = 'unavailable';
  private playerPaused = false;
  private adPlaying = false;
  private metadata: LiveCaptionMetadata = {};
  private root: Root | null = null;
  private host: HTMLDivElement | null = null;
  private listeners = new Set<(status: CaptionStatus) => void>();
  private lastRendered = '';

  constructor() {
    window.addEventListener(BRIDGE_TO_CONTENT_EVENT, (event) => {
      const message = parseBridgeMessage((event as CustomEvent).detail);
      if (!message) return;
      if (message.type === 'cue') this.handleCaptions('cea608', message.text.replace(/\r\n/g, ' '));
      else if (message.type === 'seeked') this.restart('seeked');
      else if (message.type === 'captionData') this.handleCaptionData(message.pairs);
      else if (message.type === 'state') this.handlePlayerState(message.paused);
      else if (message.type === 'language' && message.path === location.pathname) {
        this.languagePath = message.path;
        void this.handleLanguage(message.login, message.code);
      }
    });
    this.requestLanguage();
    void this.refreshOnDeviceSpeech();
    setInterval(() => {
      this.checkAd();
      // The bridge can start after this script and miss a request, so ask until it answers.
      if (this.languagePath !== location.pathname && Date.now() - this.languageRequestedAt > 1000) {
        this.requestLanguage();
      }
      // Twitch changes channels without reloading the page.
      if (location.pathname === this.path) return;
      this.path = location.pathname;
      this.login = channelLogin();
      this.seen.clear();
      this.detectedSpeechLanguage = null;
      this.restart('navigation');
      this.metadata = streamMetadata();
      this.requestLanguage();
      if (this.settings) this.useSource(this.chooseSource());
      this.emit();
    }, 500);
  }

  // Asks the MAIN-world bridge to answer; resolves false when it is not running in this page.
  pingBridge(timeoutMs = 1000): Promise<boolean> {
    return new Promise((resolve) => {
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
  }

  subscribe(listener: (status: CaptionStatus) => void) {
    this.listeners.add(listener);
    listener(this.status());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private status(): CaptionStatus {
    const available = [...this.seen];
    if (isSpeechRecognitionSupported()) available.push('stt');
    return {
      available,
      active: !!this.settings,
      activeSource: this.activeSource,
      // Waiting on an on-device download (speech recognition or translation) counts as loading.
      loading:
        this.loading ||
        (!!this.settings &&
          this.activeSource !== 'stt' &&
          this.onDeviceSpeech === 'downloading' &&
          this.speechRelevant(this.mode)) ||
        (!!this.settings &&
          this.chromeTranslation &&
          isChromeTranslatorPending(this.speechLanguage, this.settings.targetLanguage)),
      speechLanguage: this.speechLanguage,
      speechError: this.speechError,
      onDeviceSpeech: this.onDeviceSpeech,
      adPlaying: this.adPlaying,
    };
  }

  private emit() {
    const status = this.status();
    this.listeners.forEach((listener) => listener(status));
  }

  // The source 'auto' would pick right now. Captions the streamer provides beat recognizing
  // the stream's audio, which also hears game sound and music. Auto only falls back to speech
  // recognition on the device: the cloud caught about a tenth of the words (11 in 60 s, against
  // 99 in 90 s on-device, on the same stream). On-device recognition needs no consent: the audio
  // stays on the device.
  private chooseSource(): CaptionSource | null {
    const onDevice = this.onDeviceSpeech === 'available';
    if (this.mode === 'stt') {
      return onDevice || (this.speechAllowed && isSpeechRecognitionSupported()) ? 'stt' : null;
    }
    if (this.mode !== 'auto') return this.mode;
    if (this.seen.has('cea608')) return 'cea608';
    if (this.seen.has('scc')) return 'scc';
    if (onDevice) return 'stt';
    // Otherwise wait for the streamer's captions (or the on-device download).
    return 'cea608';
  }

  // Whether speech recognition is how this mode would get captions right now, once it can run.
  speechRelevant(mode: CaptionSourceMode) {
    if (mode === 'stt') return true;
    return mode === 'auto' && !this.seen.has('cea608') && !this.seen.has('scc');
  }

  // Whether starting now in this mode would send the audio to the cloud, which needs consent. Only
  // the speech recognition source does, when the language can't be recognized on this device.
  needsConsent(mode: CaptionSourceMode) {
    return mode === 'stt' && this.onDeviceSpeech === 'unavailable';
  }

  private handleCaptions(source: 'cea608' | 'scc', text: string) {
    if (text.trim() && !this.seen.has(source)) {
      // Auto mode without captions waits on the streamer's; Stream Closed Captioner showing up
      // first takes over.
      const waiting = this.mode === 'auto' && this.activeSource === 'cea608' && !this.seen.has('cea608');
      this.seen.add(source);
      if (this.settings && waiting) this.useSource(this.chooseSource());
      this.emit();
    }
    if (!this.settings || !text.trim()) return;
    if (this.activeSource === source) {
      this.segmenter?.push({ kind: 'snapshot', text, at: Date.now() });
      return;
    }
    // In auto mode a caption source that starts talking replaces speech recognition.
    if (this.mode !== 'auto' || this.activeSource !== 'stt') return;
    const now = Date.now();
    this.upgradeUpdates = [...this.upgradeUpdates, { source, at: now }].filter(
      (update) => update.source === source && now - update.at <= UPGRADE_WINDOW_MS
    );
    if (this.upgradeUpdates.length >= UPGRADE_UPDATES) this.useSource(source);
  }

  // Stream Closed Captioner shows the words being spoken and rewrites them a moment later when
  // its recognizer finalizes them; committing on a short pause would keep the first wording and
  // repeat the rest. Give it longer to settle.
  private createSegmenterFor(source: CaptionSource | null) {
    return createSegmenter({
      pauseMs: source === 'scc' ? 3000 : 1500,
      onInterim: (text) => {
        this.interim = text;
        this.interimChangedAt = Date.now();
        if (!text) this.clearInterimTranslation();
        // The buffered captions already show this chunk ends here: don't wait for the pause.
        if (this.prefetch?.isComplete(text)) {
          this.segmenter?.commitPending(Date.now());
          return;
        }
        this.scheduleInterimTranslation();
      },
      onSentence: (sentence) => {
        // The committed words leave the interim, so its translation no longer matches.
        this.clearInterimTranslation();
        const id = `l${++this.lineSequence}`;
        if (this.chromeTranslation) {
          this.lines = [...this.lines, { id, original: sentence.text, translation: undefined, changedAt: Date.now() }].slice(-20);
          this.translateLineOnDevice(id, sentence.text);
          return;
        }
        // The LLM: a translation requested ahead shows at once, or fills the line when it comes
        // (applyPrefetched); a line it doesn't cover is translated now and shows its original until then.
        const prefetched = this.prefetch?.chunk(sentence.text);
        const translation = prefetched?.status === 'done' ? prefetched.translation : undefined;
        this.lines = [...this.lines, { id, original: sentence.text, translation, changedAt: Date.now() }].slice(-20);
        if (!prefetched || prefetched.status === 'unavailable') this.queue?.enqueue({ ...sentence, id });
      },
    });
  }

  private clearInterimTranslation() {
    this.interimTranslation = '';
    this.interimGeneration++;
  }

  private scheduleInterimTranslation() {
    if (this.interimTimer || !this.interim || !this.chromeTranslation) return;
    this.interimTimer = setTimeout(() => {
      this.interimTimer = null;
      const text = this.interim;
      const target = this.settings?.targetLanguage;
      if (!text || !target) return;
      const generation = this.interimGeneration;
      void translateOnDevice(this.speechLanguage, target, [text]).then((translations) => {
        if (generation !== this.interimGeneration || !translations?.[0]) return;
        this.interimTranslation = translations[0];
        this.interimChangedAt = Date.now();
      });
    }, LIVE_TRANSLATION_MS);
  }

  // Chrome's translation shows in milliseconds.
  private translateLineOnDevice(id: string, text: string) {
    const target = this.settings?.targetLanguage;
    if (!target) return;
    void translateOnDevice(this.speechLanguage, target, [text]).then((translations) => {
      const translation = translations?.[0];
      if (!translation) return;
      this.lines = this.lines.map((line) => (line.id === id ? { ...line, translation, changedAt: Date.now() } : line));
    });
  }

  // CEA-608 pairs from the player's buffered video (twitch-player-worker.content).
  private handleCaptionData(pairs: number[][]) {
    if (!this.prefetch || this.activeSource !== 'cea608') return;
    const video = playerVideo();
    if (video) this.prefetch.add(pairs, video.currentTime);
  }

  // Lets the read-ahead captions know how far the player has buffered (see advance()).
  private advancePrefetch() {
    const video = playerVideo();
    if (!this.prefetch || this.activeSource !== 'cea608' || !video) return;
    const { buffered, currentTime } = video;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
        this.prefetch.advance(buffered.end(i));
      }
    }
  }

  private applyPrefetched(key: string, translation: string) {
    this.lines = this.lines.map((line) =>
      !line.translation && chunkKey(line.original) === key ? { ...line, translation, changedAt: Date.now() } : line
    );
  }

  private translateWithLlm = async (texts: string[], context: TranslationContext[]) => {
    const target = this.settings?.targetLanguage;
    if (!target) return null;
    const result = await translationService.translateLiveCaption(texts, context, target, this.metadata);
    if (!result?.success) debugLog('[Twitch] live caption translation failed', result?.error);
    return result?.success ? (result.translations ?? null) : null;
  };

  // Stream Closed Captioner text, relayed from its frame.
  handleSccSnapshot(text: string) {
    this.handleCaptions('scc', text);
  }

  private handlePlayerState(paused: boolean) {
    this.playerPaused = paused;
    if (this.activeSource === 'stt') getWebSpeechSource().setPaused(this.playerPaused || this.adPlaying);
  }

  // Ads are stitched into the stream: speech recognition would transcribe them, and the
  // streamer's captions stop. Clear what is shown and wait for the stream to come back.
  private checkAd() {
    const adPlaying = !!document.querySelector(AD_SELECTOR);
    if (adPlaying === this.adPlaying) return;
    this.adPlaying = adPlaying;
    if (adPlaying) this.restart('ad');
    if (this.activeSource === 'stt') getWebSpeechSource().setPaused(this.playerPaused || this.adPlaying);
    this.emit();
  }

  private requestLanguage() {
    this.languageRequestedAt = Date.now();
    window.dispatchEvent(
      new CustomEvent(CONTENT_TO_BRIDGE_EVENT, { detail: JSON.stringify({ type: 'language' }) })
    );
  }

  private async handleLanguage(login: string | null, code: string | null) {
    this.login = login ?? this.login;
    this.detectedSpeechLanguage = speechLanguageForTwitchCode(code);
    await this.refreshSpeechLanguage();
  }

  // A language the viewer picked for this channel wins over the broadcast language.
  private async refreshSpeechLanguage() {
    let picked: string | undefined;
    try {
      const stored = await chrome.storage.local.get(STORAGE_TWITCH_CHANNEL_LANGUAGE);
      picked = this.login ? stored[STORAGE_TWITCH_CHANNEL_LANGUAGE]?.[this.login] : undefined;
    } catch {
      // Extension context gone (update); keep the current language.
    }
    const language = picked ?? this.detectedSpeechLanguage ?? DEFAULT_SPEECH_LANGUAGE;
    if (language === this.speechLanguage) return this.emit();
    this.speechLanguage = language;
    if (this.activeSource === 'stt') this.startSpeech();
    void this.refreshOnDeviceSpeech();
    this.emit();
  }

  // The viewer picked a language in the menu (already saved for this channel).
  setSpeechLanguage(language: string) {
    if (language === this.speechLanguage) return;
    this.speechLanguage = language;
    if (this.activeSource === 'stt') this.startSpeech();
    void this.refreshOnDeviceSpeech();
    this.prepareTranslation();
    this.emit();
  }

  // Call it from a click: the translator's model may need downloading.
  private prepareTranslation() {
    const target = this.settings?.targetLanguage;
    if (!target || !this.chromeTranslation) return;
    void prepareChromeTranslator(this.speechLanguage, target).then(() => this.emit());
    this.emit();
  }

  // Also called when the menu opens: Chrome may have finished a download in the meantime.
  async refreshOnDeviceSpeech() {
    const language = this.speechLanguage;
    const availability = await speechAvailability(language, true);
    if (language !== this.speechLanguage || availability === this.onDeviceSpeech) return;
    this.onDeviceSpeech = availability;
    const previous = this.activeSource;
    if (this.settings) this.useSource(this.chooseSource());
    // Recognition already running in the cloud moves on-device.
    if (availability === 'available' && previous === 'stt' && this.activeSource === 'stt') this.startSpeech();
    this.emit();
  }

  // Call it from a click: Chrome needs that user activation for the download.
  private downloadOnDeviceSpeech() {
    const install = installOnDeviceSpeech(this.speechLanguage);
    this.onDeviceSpeech = 'downloading';
    this.emit();
    void install.then(() => this.refreshOnDeviceSpeech());
  }

  get channelLogin() {
    return this.login;
  }

  private startSpeech() {
    this.speechError = null;
    this.segmenter?.push({ kind: 'break', at: Date.now() });
    void getWebSpeechSource()
      .start(this.speechLanguage, {
        onSnapshot: (text, at) => {
          if (this.activeSource === 'stt') this.segmenter?.push({ kind: 'snapshot', text, at });
        },
        onBreak: (at) => {
          if (this.activeSource === 'stt') this.segmenter?.push({ kind: 'break', at });
        },
        onError: (error) => {
          this.speechError = error;
          this.emit();
        },
      })
      // Starting during an ad or a pause (channel switch, language change) starts paused.
      .then(() => {
        if (this.activeSource === 'stt') {
          getWebSpeechSource().setPaused(this.playerPaused || this.adPlaying);
        }
      });
  }

  private useSource(source: CaptionSource | null) {
    if (source === this.activeSource) return;
    debugLog('[Twitch] caption source:', this.activeSource, '->', source);
    if (this.activeSource === 'stt') getWebSpeechSource().stop();
    if (this.activeSource === 'scc' || source === 'scc') this.setSccCaptionsHidden(source === 'scc');
    this.activeSource = source;
    this.upgradeUpdates = [];
    this.segmenter?.push({ kind: 'break', at: Date.now() });
    if (this.settings) this.segmenter = this.createSegmenterFor(source);
    if (source === 'stt') this.startSpeech();
    this.emit();
  }

  activate(options: ActivateOptions) {
    if (this.settings) this.deactivate();
    const { mode, speechAllowed, chromeTranslation, ...settings } = options;
    this.mode = mode;
    this.speechAllowed = speechAllowed;
    this.chromeTranslation = chromeTranslation;
    this.settings = settings;
    this.metadata = streamMetadata();
    this.activatedAt = Date.now();
    this.loading = true;
    this.segmenter = this.createSegmenterFor(null);
    this.prefetch = createCaptionPrefetch({
      translate: chromeTranslation ? null : this.translateWithLlm,
      onTranslation: (key, translation) => this.applyPrefetched(key, translation),
      onChunk: () => {
        if (this.interim && this.prefetch?.isComplete(this.interim)) this.segmenter?.commitPending(Date.now());
      },
      position: () => playerVideo()?.currentTime ?? null,
    });
    this.queue = createTranslationQueue({
      now: () => Date.now(),
      translate: this.translateWithLlm,
      onResult: (id, translation) => {
        this.lines = this.lines.map((line) =>
          line.id === id ? { ...line, translation, changedAt: Date.now() } : line
        );
      },
    });
    this.setNativeCaptionsHidden(true);
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    // Starting is a click, so this is where the on-device model (about 60 MB per language) is
    // downloaded when speech recognition is how captions would come.
    if (this.speechRelevant(mode) && this.onDeviceSpeech === 'downloadable') this.downloadOnDeviceSpeech();
    this.prepareTranslation();
    this.useSource(this.chooseSource());
    this.emit();
  }

  updateSettings(settings: CaptionSettings) {
    if (!this.settings) return;
    const targetChanged = settings.targetLanguage !== this.settings.targetLanguage;
    this.settings = settings;
    this.lastRendered = '';
    // Picking a target language in the menu is a click, recent enough for the model download.
    if (targetChanged) this.prepareTranslation();
  }

  // Our overlay shows SCC's text, so its own captions on the video would be shown twice.
  private setSccCaptionsHidden(hidden: boolean) {
    void chrome.runtime.sendMessage({ action: MESSAGE_SCC_SET_HIDDEN, hidden }).catch(() => {});
  }

  deactivate() {
    if (this.activeSource === 'stt') getWebSpeechSource().stop();
    if (this.activeSource === 'scc') this.setSccCaptionsHidden(false);
    this.activeSource = null;
    this.speechError = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.queue?.clear();
    this.queue = null;
    this.prefetch?.dispose();
    this.prefetch = null;
    this.segmenter = null;
    this.settings = null;
    this.lines = [];
    this.interim = '';
    this.clearInterimTranslation();
    this.loading = false;
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
    this.lastRendered = '';
    this.setNativeCaptionsHidden(false);
    this.emit();
  }

  // The text on screen no longer continues: drop what is shown and start over.
  private restart(reason: string) {
    if (!this.settings) return;
    debugLog('[Twitch] restarting live captions:', reason);
    this.segmenter?.push({ kind: 'break', at: Date.now() });
    this.queue?.clear();
    // An ad only pauses the stream; a seek or another channel breaks what was read ahead.
    if (reason !== 'ad') this.prefetch?.reset(reason === 'navigation');
    this.lines = [];
    this.interim = '';
    this.clearInterimTranslation();
  }

  private setNativeCaptionsHidden(hidden: boolean) {
    const existing = document.getElementById(HIDE_NATIVE_STYLE_ID);
    if (!hidden) {
      existing?.remove();
      return;
    }
    if (existing) return;
    // A stylesheet rule, not an inline style: Twitch recreates the caption box between cues.
    const style = document.createElement('style');
    style.id = HIDE_NATIVE_STYLE_ID;
    style.textContent = '.player-captions-container { visibility: hidden !important; }';
    document.head.append(style);
  }

  private tick() {
    const now = Date.now();
    this.advancePrefetch();
    this.segmenter?.tick(now);
    if (this.loading && (this.lines.length > 0 || now - this.activatedAt > LOADING_TIMEOUT_MS)) {
      this.loading = false;
      this.emit();
    }
    this.render(now);
  }

  private ensureOverlay(): Root | null {
    const container = document.querySelector<HTMLElement>('.video-player__container');
    if (!container) return null;
    if (this.host?.isConnected && this.host.parentElement === container && this.root) return this.root;
    this.root?.unmount();
    this.host?.remove();

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
    container.append(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(tailwindRaw);
    shadow.adoptedStyleSheets = [sheet];
    const mount = document.createElement('div');
    shadow.append(mount);
    this.host = host;
    this.root = createRoot(mount);
    this.lastRendered = '';
    return this.root;
  }

  private render(now: number) {
    const settings = this.settings;
    if (!settings) return;
    const root = this.ensureOverlay();
    if (!root) return;

    const shown = this.lines.filter((line) => now - line.changedAt <= LINE_LINGER_MS).slice(-settings.numLines);
    const lines = shown.map((line) => line.translation || line.original);
    // A line still waiting for its translation shows its original once, as YouTube does.
    const originalLines = shown.map((line) => (line.translation ? line.original : ''));
    // The words still being spoken: Chrome's live translation over them, or (bilingual) the words.
    if (this.interim && now - this.interimChangedAt <= LINE_LINGER_MS) {
      if (this.interimTranslation) {
        lines.push(this.interimTranslation);
        originalLines.push(this.interim);
      } else if (settings.bilingual) {
        lines.push(this.interim);
        originalLines.push('');
      }
    }

    const key = JSON.stringify([lines, originalLines, settings.bilingual, settings.captionSizeRatio]);
    if (key === this.lastRendered) return;
    this.lastRendered = key;
    root.render(
      <StrictMode>
        <CaptionDisplay
          lines={lines}
          originalLines={originalLines}
          bilingual={settings.bilingual}
          captionSizeRatio={settings.captionSizeRatio}
        />
      </StrictMode>
    );
  }
}

let instance: TwitchLiveCaptions | null = null;

export const getTwitchLiveCaptions = () => {
  instance ??= new TwitchLiveCaptions();
  return instance;
};
