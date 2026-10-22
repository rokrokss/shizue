import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import { Language } from '@/hooks/language';
import {
  isChromeTranslatorPending,
  prepareChromeTranslator,
  translateOnDevice,
} from '@/lib/liveCaption/chromeTranslator';
import { createSegmenter, Segmenter } from '@/lib/liveCaption/segmenter';
import {
  createTranslationQueue,
  TranslationQueue,
  TranslationQueueOptions,
} from '@/lib/liveCaption/translationQueue';
import type { TranslationContext } from '@/lib/liveCaption/types';
import {
  getWebSpeechSource,
  installOnDeviceSpeech,
  isSpeechRecognitionSupported,
  SpeechAvailability,
  speechAvailability,
} from '@/lib/liveCaption/webSpeechSource';
import type { LiveCaptionMetadata } from '@/lib/prompts';
import { debugLog } from '@/logs';
import { translationService } from '@/services/translationService';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Captions translated as they appear, for streams and videos without a caption track to prepare
// ahead (Twitch, YouTube live and YouTube videos without captions). The original text comes from
// the site's own captions on screen or from speech recognition on the <video>'s audio ('stt'); each
// site supplies a LiveCaptionPlatform for what differs.

export type CaptionSettings = {
  targetLanguage: Language;
  numLines: number;
  bilingual: boolean;
  captionSizeRatio: number;
};

export type ActivateOptions<S extends string> = CaptionSettings & {
  mode: 'auto' | S | 'stt';
  // The viewer agreed to speech recognition; without it the speech source is never started.
  speechAllowed: boolean;
  // Chrome's on-device translator translates everything; otherwise only the LLM does. A line's
  // translation never changes once shown.
  chromeTranslation: boolean;
};

type Line = { id: string; original: string; translation: string | null | undefined; changedAt: number };

export type CaptionStatus<S extends string> = {
  // Caption sources that produced text on this page, plus 'stt' when supported.
  available: (S | 'stt')[];
  active: boolean;
  activeSource: S | 'stt' | null;
  loading: boolean;
  // The language speech recognition listens for on this page.
  speechLanguage: string;
  speechError: string | null;
  // Whether that language can be recognized on this device (no audio leaves it).
  onDeviceSpeech: SpeechAvailability;
  // An ad is playing; captions and speech recognition wait, and the button hides.
  adPlaying: boolean;
};

// What a read-ahead knows about a chunk: 'pending' while its LLM translation is on the way,
// 'unavailable' when there is none (no model, or the request failed).
export type ReadAheadChunk =
  | { status: 'pending' }
  | { status: 'done'; translation: string }
  | { status: 'unavailable' };

// Captions read ahead of playback (Twitch: the broadcaster's CEA-608 in the player's buffer). When
// the chunk on screen matches one already read, it commits without waiting for the pause and shows
// the translation requested ahead.
export type ReadAhead = {
  isComplete: (text: string) => boolean;
  chunk: (text: string) => ReadAheadChunk | undefined;
  // How chunks are matched (their words, not punctuation or case).
  key: (text: string) => string;
  // Called every tick.
  tick: () => void;
  // A seek or another page: what was read no longer continues.
  reset: (navigation: boolean) => void;
  dispose: () => void;
};

export type ReadAheadOptions = {
  // The LLM path, or null when Chrome translates (then only early commit is used).
  translate: TranslationQueueOptions['translate'] | null;
  onTranslation: (key: string, translation: string) => void;
  // A chunk just ended in what was read; the chunk on screen may already be complete.
  onChunk: () => void;
};

export type LiveCaptionPlatform<S extends string> = {
  // Log prefix, and part of the IDs this puts in the page.
  name: string;
  // The site's caption sources on this page, in the order 'auto' prefers them. Captions beat
  // recognizing the audio, which also hears music and sound effects, so speech recognition comes
  // after them.
  captionSources: () => readonly S[];
  video: () => HTMLVideoElement | null;
  // The overlay lives in this element, which must stay visible in fullscreen.
  overlayParent: () => HTMLElement | null;
  // Puts the overlay's elements in `parent`; ours renders in a shadow root on `shadowHost`.
  createOverlay: (parent: HTMLElement) => { element: HTMLElement; shadowHost: HTMLElement };
  // A stylesheet rule that hides the site's own captions while ours show.
  hideNativeCaptionsCss: string;
  // Changes when the viewer moves to another stream or video, which starts everything over.
  pageKey: () => string;
  // The channel a speech language picked in the menu is remembered for.
  channelKey: () => string | null;
  channelLanguageStorageKey: string;
  metadata: () => LiveCaptionMetadata;
  isAdPlaying: () => boolean;
  // Whether speech recognition may run in the cloud (after consent) for a language the device
  // can't recognize.
  allowCloudSpeech: boolean;
  // How long the words must stay still before the segmenter commits them.
  pauseMs?: (source: S | 'stt' | null) => number;
  // Whether the source shows whole blocks of lines rather than rolling text (SegmenterOptions.blocks).
  blockCaptions?: (source: S | 'stt' | null) => boolean;
  onSourceChange?: (from: S | 'stt' | null, to: S | 'stt' | null) => void;
  onPageChange?: () => void;
  createReadAhead?: (options: ReadAheadOptions) => ReadAhead;
};

const TICK_MS = 100;
const POLL_MS = 500;
// A line leaves the screen this long after it last changed (shown, then translated), even while
// the speaker keeps talking.
const LINE_LINGER_MS = 6000;
// Chrome translates in milliseconds, so the words still being spoken are translated as they come
// (at most this often), as caption extensions that use Google Translate do. Waiting for a chunk to
// be committed held translations back 2–4 s, and 4–6 s on Stream Closed Captioner.
const LIVE_TRANSLATION_MS = 300;
const LOADING_TIMEOUT_MS = 5000;
// While speech recognition stands in, this many caption updates within the window means the site's
// captions are running: switch to them.
const UPGRADE_UPDATES = 2;
const UPGRADE_WINDOW_MS = 10_000;
const DEFAULT_SPEECH_LANGUAGE = 'en-US';

export class LiveCaptionController<S extends string> {
  private settings: CaptionSettings | null = null;
  private mode: 'auto' | S | 'stt' = 'auto';
  private speechAllowed = false;
  private chromeTranslation = false;
  // Line IDs stay unique across sources: each new segmenter numbers its sentences from 1.
  private lineSequence = 0;
  private activeSource: S | 'stt' | null = null;
  private segmenter: Segmenter | null = null;
  private queue: TranslationQueue | null = null;
  private readAhead: ReadAhead | null = null;
  private lines: Line[] = [];
  private interim = '';
  private interimChangedAt = 0;
  // Chrome's translation of the words still being spoken, and what makes older answers stale.
  private interimTranslation = '';
  private interimGeneration = 0;
  private interimTimer: ReturnType<typeof setTimeout> | null = null;
  private activatedAt = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<S>();
  private upgradeUpdates: { source: S; at: number }[] = [];
  private loading = false;
  private page: string;
  private channelId: string | null;
  private detectedSpeechLanguage: string | null = null;
  private speechLanguage = DEFAULT_SPEECH_LANGUAGE;
  private speechError: string | null = null;
  private onDeviceSpeech: SpeechAvailability = 'unavailable';
  private playerPaused = false;
  private adPlaying = false;
  private metadata: LiveCaptionMetadata = {};
  private root: Root | null = null;
  private overlay: HTMLElement | null = null;
  private listeners = new Set<(status: CaptionStatus<S>) => void>();
  private lastRendered = '';

  constructor(private platform: LiveCaptionPlatform<S>) {
    this.page = platform.pageKey();
    this.channelId = platform.channelKey();
    void this.refreshOnDeviceSpeech();
    this.pollTimer = setInterval(() => {
      this.checkAd();
      this.checkPage();
    }, POLL_MS);
  }

  subscribe(listener: (status: CaptionStatus<S>) => void) {
    this.listeners.add(listener);
    listener(this.status());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private status(): CaptionStatus<S> {
    const available: (S | 'stt')[] = [...this.seen];
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

  get channel() {
    return this.channelId;
  }

  get source() {
    return this.activeSource;
  }

  // The source 'auto' would pick right now. Auto only falls back to speech recognition on the
  // device: on Twitch the cloud caught about a tenth of the words (11 in 60 s, against 99 in 90 s
  // on-device, on the same stream). On-device recognition needs no consent: the audio stays on the
  // device.
  private chooseSource(): S | 'stt' | null {
    const onDevice = this.onDeviceSpeech === 'available';
    if (this.mode === 'stt') {
      const cloud = this.platform.allowCloudSpeech && this.speechAllowed && isSpeechRecognitionSupported();
      return onDevice || cloud ? 'stt' : null;
    }
    if (this.mode !== 'auto') return this.mode;
    const sources = this.platform.captionSources();
    const seen = sources.find((source) => this.seen.has(source));
    if (seen) return seen;
    if (onDevice) return 'stt';
    // Otherwise wait for the site's captions (or the on-device download).
    return sources[0] ?? null;
  }

  // Whether speech recognition is how this mode would get captions right now, once it can run.
  speechRelevant(mode: 'auto' | S | 'stt') {
    if (mode === 'stt') return true;
    return mode === 'auto' && !this.platform.captionSources().some((source) => this.seen.has(source));
  }

  // Whether starting now in this mode would send the audio to the cloud, which needs consent. Only
  // the speech recognition source does, when the language can't be recognized on this device.
  needsConsent(mode: 'auto' | S | 'stt') {
    return this.platform.allowCloudSpeech && mode === 'stt' && this.onDeviceSpeech === 'unavailable';
  }

  // The source has captions on this page, known before any text arrives or seen just now.
  markSeen(source: S) {
    if (this.seen.has(source)) return;
    // Auto mode without captions waits on the first caption source; another one showing up first
    // takes over.
    const waiting =
      this.mode === 'auto' &&
      this.activeSource !== null &&
      this.activeSource !== 'stt' &&
      !this.seen.has(this.activeSource);
    this.seen.add(source);
    if (this.settings && waiting) this.useSource(this.chooseSource());
    this.emit();
  }

  // The text a caption source shows now (a roll-up window, or everything recognized so far).
  handleCaptions(source: S, text: string) {
    if (text.trim()) this.markSeen(source);
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

  private createSegmenterFor(source: S | 'stt' | null) {
    return createSegmenter({
      pauseMs: this.platform.pauseMs?.(source) ?? 1500,
      blocks: this.platform.blockCaptions?.(source) ?? false,
      onInterim: (text) => {
        this.interim = text;
        this.interimChangedAt = Date.now();
        if (!text) this.clearInterimTranslation();
        // The captions read ahead already show this chunk ends here: don't wait for the pause.
        if (this.readAhead?.isComplete(text)) {
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
        // (applyReadAhead); a line it doesn't cover is translated now and shows its original until then.
        const known = this.readAhead?.chunk(sentence.text);
        const translation = known?.status === 'done' ? known.translation : undefined;
        this.lines = [...this.lines, { id, original: sentence.text, translation, changedAt: Date.now() }].slice(-20);
        if (!known || known.status === 'unavailable') this.queue?.enqueue({ ...sentence, id });
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

  private applyReadAhead(key: string, translation: string) {
    const readAhead = this.readAhead;
    if (!readAhead) return;
    this.lines = this.lines.map((line) =>
      !line.translation && readAhead.key(line.original) === key ? { ...line, translation, changedAt: Date.now() } : line
    );
  }

  private translateWithLlm = async (texts: string[], context: TranslationContext[]) => {
    const target = this.settings?.targetLanguage;
    if (!target) return null;
    const result = await translationService.translateLiveCaption(texts, context, target, this.metadata);
    if (!result?.success) debugLog(`[${this.platform.name}] live caption translation failed`, result?.error);
    return result?.success ? (result.translations ?? null) : null;
  };

  handlePlayerState(paused: boolean) {
    this.playerPaused = paused;
    if (this.activeSource === 'stt') getWebSpeechSource().setPaused(this.playerPaused || this.adPlaying);
  }

  // Speech recognition would transcribe an ad, and the site's captions stop. Clear what is shown
  // and wait for the stream or video to come back.
  private checkAd() {
    const adPlaying = this.platform.isAdPlaying();
    if (adPlaying === this.adPlaying) return;
    this.adPlaying = adPlaying;
    if (adPlaying) this.restart('ad');
    if (this.activeSource === 'stt') getWebSpeechSource().setPaused(this.playerPaused || this.adPlaying);
    this.emit();
  }

  // Twitch changes channels and YouTube changes videos without reloading the page.
  private checkPage() {
    const page = this.platform.pageKey();
    if (page === this.page) return;
    this.page = page;
    this.channelId = this.platform.channelKey();
    this.seen.clear();
    this.detectedSpeechLanguage = null;
    this.restart('navigation');
    this.metadata = this.platform.metadata();
    this.platform.onPageChange?.();
    if (this.settings) this.useSource(this.chooseSource());
    this.emit();
  }

  // The language the stream or video is in, as the site reports it (null if unknown). `channel`
  // replaces the page's channel when the site names it then (a Twitch VOD's channel).
  async setDetectedSpeechLanguage(language: string | null, channel?: string | null) {
    this.channelId = channel ?? this.channelId;
    this.detectedSpeechLanguage = language;
    await this.refreshSpeechLanguage();
  }

  // A language the viewer picked for this channel wins over the detected one.
  private async refreshSpeechLanguage() {
    let picked: string | undefined;
    const key = this.platform.channelLanguageStorageKey;
    try {
      const stored = await chrome.storage.local.get(key);
      picked = this.channelId ? stored[key]?.[this.channelId] : undefined;
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

  private startSpeech() {
    this.speechError = null;
    this.segmenter?.push({ kind: 'break', at: Date.now() });
    void getWebSpeechSource()
      .start(
        this.speechLanguage,
        {
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
        },
        () => this.platform.video()
      )
      // Starting during an ad or a pause (navigation, language change) starts paused.
      .then(() => {
        if (this.activeSource === 'stt') {
          getWebSpeechSource().setPaused(this.playerPaused || this.adPlaying);
        }
      });
  }

  private useSource(source: S | 'stt' | null) {
    if (source === this.activeSource) return;
    debugLog(`[${this.platform.name}] caption source:`, this.activeSource, '->', source);
    if (this.activeSource === 'stt') getWebSpeechSource().stop();
    this.platform.onSourceChange?.(this.activeSource, source);
    this.activeSource = source;
    this.upgradeUpdates = [];
    this.segmenter?.push({ kind: 'break', at: Date.now() });
    if (this.settings) this.segmenter = this.createSegmenterFor(source);
    if (source === 'stt') this.startSpeech();
    this.emit();
  }

  activate(options: ActivateOptions<S>) {
    if (this.settings) this.deactivate();
    const { mode, speechAllowed, chromeTranslation, ...settings } = options;
    this.mode = mode;
    this.speechAllowed = speechAllowed;
    this.chromeTranslation = chromeTranslation;
    this.settings = settings;
    this.metadata = this.platform.metadata();
    this.activatedAt = Date.now();
    this.loading = true;
    this.segmenter = this.createSegmenterFor(null);
    this.readAhead =
      this.platform.createReadAhead?.({
        translate: chromeTranslation ? null : this.translateWithLlm,
        onTranslation: (key, translation) => this.applyReadAhead(key, translation),
        onChunk: () => {
          if (this.interim && this.readAhead?.isComplete(this.interim)) this.segmenter?.commitPending(Date.now());
        },
      }) ?? null;
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

  deactivate() {
    if (this.activeSource === 'stt') getWebSpeechSource().stop();
    if (this.activeSource !== null) this.platform.onSourceChange?.(this.activeSource, null);
    this.activeSource = null;
    this.speechError = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.queue?.clear();
    this.queue = null;
    this.readAhead?.dispose();
    this.readAhead = null;
    this.segmenter = null;
    this.settings = null;
    this.lines = [];
    this.interim = '';
    this.clearInterimTranslation();
    this.loading = false;
    this.root?.unmount();
    this.root = null;
    this.overlay?.remove();
    this.overlay = null;
    this.lastRendered = '';
    this.setNativeCaptionsHidden(false);
    this.emit();
  }

  // Stops everything this controller runs; it can't be used afterwards.
  dispose() {
    this.deactivate();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.listeners.clear();
  }

  // The text on screen no longer continues: drop what is shown and start over.
  restart(reason: string) {
    if (!this.settings) return;
    debugLog(`[${this.platform.name}] restarting live captions:`, reason);
    this.segmenter?.push({ kind: 'break', at: Date.now() });
    this.queue?.clear();
    // An ad only pauses the stream; a seek or another page breaks what was read ahead.
    if (reason !== 'ad') this.readAhead?.reset(reason === 'navigation');
    this.lines = [];
    this.interim = '';
    this.clearInterimTranslation();
  }

  private setNativeCaptionsHidden(hidden: boolean) {
    const id = `shizue-${this.platform.name.toLowerCase()}-hide-native-captions`;
    const existing = document.getElementById(id);
    if (!hidden) {
      existing?.remove();
      return;
    }
    if (existing) return;
    // A stylesheet rule, not an inline style: sites recreate their caption boxes.
    const style = document.createElement('style');
    style.id = id;
    style.textContent = this.platform.hideNativeCaptionsCss;
    document.head.append(style);
  }

  private tick() {
    const now = Date.now();
    this.readAhead?.tick();
    this.segmenter?.tick(now);
    if (this.loading && (this.lines.length > 0 || now - this.activatedAt > LOADING_TIMEOUT_MS)) {
      this.loading = false;
      this.emit();
    }
    this.render(now);
  }

  private ensureOverlay(): Root | null {
    const parent = this.platform.overlayParent();
    if (!parent) return null;
    if (this.overlay?.isConnected && this.overlay.parentElement === parent && this.root) return this.root;
    this.root?.unmount();
    this.overlay?.remove();

    const { element, shadowHost } = this.platform.createOverlay(parent);
    const shadow = shadowHost.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(tailwindRaw);
    shadow.adoptedStyleSheets = [sheet];
    const mount = document.createElement('div');
    shadow.append(mount);
    this.overlay = element;
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
