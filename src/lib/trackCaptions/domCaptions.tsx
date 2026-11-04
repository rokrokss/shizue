import { prepareChromeTranslator, translateOnDevice } from '@/lib/liveCaption/chromeTranslator';
import type { TranslationContext } from '@/lib/liveCaption/types';
import { detectLanguage } from '@/lib/textLanguage';
import { CaptionOverlay, createCaptionOverlay } from '@/lib/trackCaptions/overlay';
import type { CaptionSettings, TrackCaptionStatus, VideoCaptionController } from '@/lib/trackCaptions/trackCaptions';
import { DomCaptionSite, isIn } from '@/lib/trackCaptions/tracks';
import { debugLog } from '@/logs';
import { translationService } from '@/services/translationService';

// Subtitles a player draws itself (Disney+, Prime Video, Max, Udemy), read off the screen as they
// change and translated one line at a time: Chrome's on-device translator answers in milliseconds;
// the chat model takes about a second, with the lines before as context, and the original shows
// until then. A line seen before is answered from memory (a rewind, a repeated phrase). The site's
// own subtitles are made invisible but stay in the page, since that is where they are read.

const POLL_MS = 100;
const CONTEXT_LINES = 3;
// How long the hint to turn subtitles on shows when none have appeared.
const HINT_MS = 6000;

// A cue's lines as one line of text.
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();

class DomCaptions implements VideoCaptionController {
  readonly translatesLive = true;
  private settings: CaptionSettings | null = null;
  private video: HTMLVideoElement | null = null;
  private cue = '';
  // undefined while a line is translated, null when it couldn't be.
  private translations = new Map<string, string | null | undefined>();
  private context: TranslationContext[] = [];
  private heard = '';
  private source: string | null = null;
  private seenCue = false;
  private activatedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hideStyle: HTMLStyleElement | null = null;
  private overlay: CaptionOverlay;
  private listeners = new Set<(status: TrackCaptionStatus) => void>();
  private waiting = false;
  // Bumped by every activation, so answers for an earlier one are dropped.
  private generation = 0;

  constructor(private site: DomCaptionSite) {
    this.overlay = createCaptionOverlay(site);
  }

  subscribe(listener: (status: TrackCaptionStatus) => void) {
    this.listeners.add(listener);
    listener(this.status());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private status(): TrackCaptionStatus {
    return { video: this.video, loading: this.waiting };
  }

  private emit() {
    const status = this.status();
    this.listeners.forEach((listener) => listener(status));
  }

  // Call it from a click: Chrome's translator may need to download its model.
  activate(video: HTMLVideoElement, settings: CaptionSettings) {
    this.deactivate();
    this.generation++;
    this.settings = settings;
    this.video = video;
    this.activatedAt = Date.now();
    this.seenCue = false;
    if (this.site.ownCaptions) {
      const style = document.createElement('style');
      style.textContent = `${this.site.ownCaptions} { opacity: 0 !important; }`;
      document.head.append(style);
      this.hideStyle = style;
    }
    this.timer = setInterval(() => this.read(), POLL_MS);
    this.read();
    if (settings.chromeTranslation && this.source) void prepareChromeTranslator(this.source, settings.targetLanguage);
    this.emit();
  }

  updateSettings(settings: CaptionSettings) {
    const previous = this.settings;
    if (!previous) return;
    this.settings = settings;
    this.overlay.invalidate();
    if (settings.targetLanguage !== previous.targetLanguage || settings.chromeTranslation !== previous.chromeTranslation) {
      this.generation++;
      this.translations.clear();
      this.context = [];
      if (this.cue) void this.translate(this.cue);
    }
  }

  deactivate() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.overlay.remove();
    this.hideStyle?.remove();
    this.hideStyle = null;
    const wasActive = this.video !== null;
    this.settings = null;
    this.video = null;
    this.cue = '';
    this.waiting = false;
    if (wasActive) this.emit();
  }

  private read() {
    const video = this.video;
    if (!video || !this.settings) return;
    // The player went away (another title, or the page moved on).
    if (!video.isConnected) return this.deactivate();
    const cue = oneLine(this.site.cue(video));
    if (cue !== this.cue) {
      this.cue = cue;
      if (cue) {
        this.seenCue = true;
        this.heard = `${this.heard} ${cue}`.slice(-400);
        void this.translate(cue);
      }
    }
    this.render();
  }

  private async translate(text: string) {
    const settings = this.settings;
    if (!settings || this.translations.has(text)) return;
    const generation = this.generation;
    this.translations.set(text, undefined);
    this.source ??= await detectLanguage(this.heard.trim());
    let translation: string | null = null;
    if (this.source && isIn(this.source, settings.targetLanguage)) {
      translation = text;
    } else {
      if (settings.chromeTranslation && this.source) {
        const translated = await translateOnDevice(this.source, settings.targetLanguage, [text]).catch(() => undefined);
        translation = translated?.[0] ?? null;
      }
      if (!translation && settings.modelAvailable !== false) translation = await this.translateWithModel(text, settings);
    }
    if (generation !== this.generation) return;
    this.translations.set(text, translation);
    if (translation) this.context = [...this.context, { source: text, translation }].slice(-CONTEXT_LINES);
    this.render();
  }

  private async translateWithModel(text: string, settings: CaptionSettings) {
    try {
      const result = await translationService.translateSubtitles([text], this.context, [], settings.targetLanguage, {
        title: this.video ? this.site.title(this.video) : document.title,
      });
      if (!result.success) debugLog(`[${this.site.name}] subtitle translation failed`, result.error);
      return result.success ? (result.translations?.[0] ?? null) : null;
    } catch {
      return null;
    }
  }

  private render() {
    const settings = this.settings;
    const video = this.video;
    if (!settings || !video) return;
    const translation = this.cue ? this.translations.get(this.cue) : null;
    const waiting = !!this.cue && translation === undefined;
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.emit();
    }
    let lines: string[] = [];
    let originalLines: string[] = [];
    if (this.cue) {
      // Until its translation arrives, a line shows its original, as on YouTube.
      lines = [translation || this.cue];
      originalLines = [translation && translation !== this.cue ? this.cue : ''];
    } else if (!this.seenCue && settings.hint && Date.now() - this.activatedAt < HINT_MS) {
      lines = [settings.hint];
      originalLines = [''];
    }
    this.overlay.render(video, lines, originalLines, settings);
  }
}

const instances = new Map<string, DomCaptions>();

export const getDomCaptions = (site: DomCaptionSite) => {
  let instance = instances.get(site.name);
  if (!instance) {
    instance = new DomCaptions(site);
    instances.set(site.name, instance);
  }
  return instance;
};
