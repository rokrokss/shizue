import tailwindRaw from '@/assets/tailwind.css?inline';
import MeetingCaptionCard, { MEETING_CARD_CSS, MeetingCardRow } from '@/components/Caption/MeetingCaptionCard';
import type { Language } from '@/hooks/language';
import type { CaptionDisplayMode } from '@/hooks/layout';
import { isChromeTranslatorPending, prepareChromeTranslator, translateOnDevice } from '@/lib/liveCaption/chromeTranslator';
import { createTranslationQueue, TranslationQueue } from '@/lib/liveCaption/translationQueue';
import type { MeetingSite } from '@/lib/meetingCaptions/sites';
import { createMeetingTranscript, MeetingTranscript, TranscriptLine } from '@/lib/meetingCaptions/transcript';
import { detectLanguage } from '@/lib/textLanguage';
import { debugLog } from '@/logs';
import { translationService } from '@/services/translationService';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Translated captions for a meeting on the web (Google Meet, Teams, Zoom). The meeting's own live
// captions are read as they change, cut into lines per speaker, and translated by Chrome's
// on-device translator (milliseconds, nothing leaves the device, the words still being said too)
// or the chat model (with the lines before as context). The card takes the place of the site's
// caption box, which is kept in the page but made invisible once it reads.

export type MeetingCaptionSettings = {
  targetLanguage: Language;
  display: CaptionDisplayMode;
  sizeRatio: number;
  // Chrome's translator first; the chat model when it can't (or when this is off).
  chromeTranslation: boolean;
  modelAvailable: boolean;
};

export type MeetingCaptionStatus = {
  // The site's captions are on.
  captionsOn: boolean;
  active: boolean;
};

export type MeetingCaptionLabels = {
  waiting: string;
  turnOnCaptions: string;
  unreadable: string;
  preparing: string;
};

type Line = { id: string; speaker: string; original: string; translation: string | null | undefined; at: number };

const POLL_MS = 1000;
const TICK_MS = 100;
const SHOWN_LINES = 3;
// A line leaves the card this long after it was said, so a quiet meeting doesn't keep old lines up.
const LINE_LINGER_MS = 12_000;
const LIVE_TRANSLATION_MS = 300;
const HIDDEN_ATTRIBUTE = 'data-shizue-meeting-captions-hidden';
// More text than a caption box's own labels, read as no caption block: the markup changed.
const UNREADABLE_TEXT = 80;

class MeetingCaptions {
  private settings: MeetingCaptionSettings | null = null;
  private labels: MeetingCaptionLabels | null = null;
  private region: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private transcript: MeetingTranscript | null = null;
  private queue: TranslationQueue | null = null;
  private lines: Line[] = [];
  private interim = { speaker: '', text: '', translation: '' };
  private interimGeneration = 0;
  private interimTimer: ReturnType<typeof setTimeout> | null = null;
  // The language spoken, once the captions tell (for Chrome's translator).
  private source: string | null = null;
  private heard = '';
  private readable = false;
  private unreadable = false;
  private readScheduled = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private host: HTMLElement | null = null;
  private hideStyle: HTMLStyleElement | null = null;
  private root: Root | null = null;
  private listeners = new Set<(status: MeetingCaptionStatus) => void>();
  private captionsOn = false;
  private pollTimer: ReturnType<typeof setInterval>;
  private lastRendered = '';

  constructor(private site: MeetingSite) {
    this.pollTimer = setInterval(() => this.poll(), POLL_MS);
    this.poll();
  }

  // The content script went away (extension update).
  dispose() {
    this.deactivate();
    clearInterval(this.pollTimer);
  }

  subscribe(listener: (status: MeetingCaptionStatus) => void) {
    this.listeners.add(listener);
    listener(this.status());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private status(): MeetingCaptionStatus {
    return { captionsOn: this.captionsOn, active: this.settings !== null };
  }

  private emit() {
    const status = this.status();
    this.listeners.forEach((listener) => listener(status));
  }

  // Call it from a click: Chrome's translator may need to download its model.
  activate(settings: MeetingCaptionSettings, labels: MeetingCaptionLabels) {
    this.deactivate();
    this.settings = settings;
    this.labels = labels;
    this.lines = [];
    this.source = null;
    this.heard = '';
    this.readable = false;
    this.unreadable = false;
    this.transcript = createMeetingTranscript({
      onLine: (line) => this.addLine(line),
      onInterim: (speaker, text) => this.setInterim(speaker, text),
    });
    this.queue = createTranslationQueue({
      now: () => Date.now(),
      translate: async (texts, context) => {
        const result = await translationService.translateLiveCaption(texts, context, settings.targetLanguage, {
          title: this.site.title(document),
        });
        if (!result?.success) debugLog('[Meeting] caption translation failed', result?.error);
        return result?.success ? (result.translations ?? null) : null;
      },
      onResult: (id, translation) => this.setTranslation(id, translation),
    });
    this.tickTimer = setInterval(() => {
      this.transcript?.tick(Date.now());
      this.render();
    }, TICK_MS);
    this.attach(this.site.region(document));
    // The captions on screen already tell the language: get the model while the click counts.
    const shown = this.region ? this.site.blocks(this.region).map((block) => block.text).join(' ') : '';
    if (settings.chromeTranslation && shown) {
      void detectLanguage(shown).then((language) => {
        if (!language || !this.settings) return;
        this.source ??= language;
        void prepareChromeTranslator(language, settings.targetLanguage).then(() => this.render());
      });
    }
    this.emit();
    this.render();
  }

  updateSettings(settings: MeetingCaptionSettings) {
    if (!this.settings) return;
    const retranslate =
      settings.targetLanguage !== this.settings.targetLanguage ||
      settings.chromeTranslation !== this.settings.chromeTranslation;
    this.settings = settings;
    if (retranslate) {
      // Lines already shown keep their translation; new ones use the new language or engine.
      this.queue?.clear();
      this.interim.translation = '';
    }
    this.render();
  }

  deactivate() {
    if (!this.settings) return;
    this.settings = null;
    this.observer?.disconnect();
    this.observer = null;
    this.queue?.clear();
    this.queue = null;
    this.transcript = null;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    if (this.interimTimer) clearTimeout(this.interimTimer);
    this.interimTimer = null;
    this.region?.removeAttribute(HIDDEN_ATTRIBUTE);
    this.region = null;
    this.hideStyle?.remove();
    this.hideStyle = null;
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
    this.lastRendered = '';
    this.lines = [];
    this.interim = { speaker: '', text: '', translation: '' };
    this.emit();
  }

  // The caption box comes and goes as captions are turned on and off, and the sites replace it.
  private poll() {
    const region = this.site.region(document);
    const on = region !== null;
    if (on !== this.captionsOn) {
      this.captionsOn = on;
      this.emit();
    }
    if (this.settings && region !== this.region) this.attach(region);
  }

  private attach(region: HTMLElement | null) {
    this.observer?.disconnect();
    this.observer = null;
    this.region?.removeAttribute(HIDDEN_ATTRIBUTE);
    if (this.region && !region) this.transcript?.flush(Date.now());
    this.region = region;
    this.readable = false;
    if (!region) return this.render();
    this.observer = new MutationObserver(() => this.scheduleRead());
    this.observer.observe(region, { childList: true, subtree: true, characterData: true });
    this.read();
  }

  private scheduleRead() {
    if (this.readScheduled) return;
    this.readScheduled = true;
    setTimeout(() => {
      this.readScheduled = false;
      this.read();
    }, 50);
  }

  private read() {
    const region = this.region;
    if (!region || !this.transcript) return;
    const blocks = this.site.blocks(region);
    // Text in the box that reads as no block: the site changed its captions' markup.
    this.unreadable = blocks.length === 0 && (region.textContent ?? '').trim().length > UNREADABLE_TEXT;
    if (blocks.length && !this.readable) {
      // Only once ours show the same words is the site's box made invisible.
      this.readable = true;
      region.setAttribute(HIDDEN_ATTRIBUTE, '');
      if (!this.hideStyle) {
        const style = document.createElement('style');
        style.textContent = `[${HIDDEN_ATTRIBUTE}] { opacity: 0 !important; }`;
        document.head.append(style);
        this.hideStyle = style;
      }
    }
    this.transcript.update(blocks, Date.now());
    this.render();
  }

  private addLine(line: TranscriptLine) {
    this.lines = [
      ...this.lines,
      { id: line.id, speaker: line.speaker, original: line.text, translation: undefined, at: Date.now() },
    ].slice(-20);
    this.heard = `${this.heard} ${line.text}`.slice(-400);
    void this.translateLine(line);
    this.render();
  }

  private async translateLine(line: TranscriptLine) {
    const settings = this.settings;
    if (!settings) return;
    if (settings.chromeTranslation) {
      const source = await this.sourceLanguage('');
      const translated = source ? await translateOnDevice(source, settings.targetLanguage, [line.text]) : undefined;
      if (this.settings !== settings) return;
      if (translated) return this.setTranslation(line.id, translated[0]);
    }
    if (settings.modelAvailable && this.queue) {
      this.queue.enqueue({ id: line.id, text: line.text, startedAt: Date.now(), committedAt: Date.now() });
      return;
    }
    // Neither can translate it (yet): the original stays.
    this.setTranslation(line.id, null);
  }

  // `sample` adds words not yet in a line.
  private async sourceLanguage(sample: string) {
    this.source ??= await detectLanguage(`${this.heard} ${sample}`.trim());
    return this.source;
  }

  private setTranslation(id: string, translation: string | null) {
    this.lines = this.lines.map((line) => (line.id === id ? { ...line, translation } : line));
    this.render();
  }

  // Chrome translates the words still being said as they come, at most this often; the chat model
  // waits for the line.
  private setInterim(speaker: string, text: string) {
    const changed = text !== this.interim.text;
    // The last translation stays up until the next one: no flicker while words come.
    this.interim = { speaker, text, translation: text ? this.interim.translation : '' };
    if (!changed || !text || !this.settings?.chromeTranslation || this.interimTimer) return;
    this.interimTimer = setTimeout(() => {
      this.interimTimer = null;
      void this.translateInterim();
    }, LIVE_TRANSLATION_MS);
  }

  private async translateInterim() {
    const settings = this.settings;
    const text = this.interim.text;
    if (!settings || !text) return;
    const generation = ++this.interimGeneration;
    const source = await this.sourceLanguage(text);
    if (!source) return;
    const translated = await translateOnDevice(source, settings.targetLanguage, [text]).catch(() => undefined);
    if (generation !== this.interimGeneration || !translated || this.settings !== settings) return;
    // Words may have come since: the translation is of the words asked about.
    if (this.interim.text.startsWith(text)) this.interim.translation = translated[0];
    this.render();
  }

  private notice(): string | null {
    const labels = this.labels;
    if (!labels || !this.settings) return null;
    if (!this.region) return labels.turnOnCaptions;
    if (this.unreadable) return labels.unreadable;
    if (
      this.settings.chromeTranslation &&
      this.source &&
      isChromeTranslatorPending(this.source, this.settings.targetLanguage)
    )
      return labels.preparing;
    return labels.waiting;
  }

  private ensureHost(): Root {
    if (this.host?.isConnected && this.root) return this.root;
    this.root?.unmount();
    this.host?.remove();
    const host = document.createElement('div');
    host.id = `shizue-${this.site.name}-meeting-captions`;
    // Inline styles: this element sits in the site's DOM, outside our stylesheet.
    Object.assign(host.style, {
      position: 'fixed',
      zIndex: '2147483646',
      pointerEvents: 'none',
      transform: 'translateX(-50%)',
      transition: 'left 200ms ease, bottom 200ms ease, width 200ms ease',
    });
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(tailwindRaw + MEETING_CARD_CSS);
    shadow.adoptedStyleSheets = [sheet];
    const mount = document.createElement('div');
    shadow.append(mount);
    this.host = host;
    this.root = createRoot(mount);
    this.lastRendered = '';
    return this.root;
  }

  // Over the site's caption box, from its bottom up; centered low on the page without one.
  private place(host: HTMLElement) {
    const rect = this.region?.getBoundingClientRect();
    const visible = rect && rect.width > 0 && rect.height > 0;
    const width = Math.min(visible ? Math.max(rect.width, 320) : 560, 760, window.innerWidth - 32);
    const left = visible ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const bottom = visible ? Math.max(8, window.innerHeight - rect.bottom) : 120;
    Object.assign(host.style, { left: `${left}px`, bottom: `${bottom}px`, width: `${width}px` });
  }

  private render() {
    const settings = this.settings;
    if (!settings) return;
    const now = Date.now();
    const recent = this.lines.filter((line) => now - line.at <= LINE_LINGER_MS);
    const rows: MeetingCardRow[] = recent.slice(-SHOWN_LINES).map((line) => ({
      id: line.id,
      speaker: line.speaker,
      original: line.original,
      translation: line.translation,
    }));
    if (this.interim.text) {
      rows.push({
        id: 'interim',
        speaker: this.interim.speaker,
        original: this.interim.text,
        translation: this.interim.translation || undefined,
        interim: true,
      });
    }
    const root = this.ensureHost();
    this.place(this.host!);
    const shown = rows.slice(-SHOWN_LINES);
    const notice = this.notice();
    const key = JSON.stringify([shown, notice, settings.display, settings.sizeRatio]);
    if (key === this.lastRendered) return;
    this.lastRendered = key;
    root.render(
      <StrictMode>
        <MeetingCaptionCard rows={shown} display={settings.display} sizeRatio={settings.sizeRatio} notice={notice} />
      </StrictMode>
    );
  }
}

let instance: MeetingCaptions | null = null;

export const getMeetingCaptions = (site: MeetingSite) => {
  instance ??= new MeetingCaptions(site);
  return instance;
};

export type MeetingCaptionController = MeetingCaptions;
