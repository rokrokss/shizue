import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import type { Language } from '@/hooks/language';
import type { CaptionDisplayMode, CaptionStyle } from '@/hooks/layout';
import { languageCodeToLanguage } from '@/lib/language';
import { createCueTranslator, CueTranslator } from '@/lib/netflix/cueTranslator';
import { findCueIndex } from '@/lib/netflix/subtitles';
import type { Caption } from '@/lib/youtube';
import { translationService } from '@/services/translationService';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// X's player loads a video's captions (the poster's own subtitle file) as a text track, which
// loads all its cues once it is shown or hidden. The track is kept hidden while ours show, and the
// LLM translates its cues as on Netflix: in chunks from the playback position, with the lines
// around each chunk as context.

export type CaptionSettings = {
  targetLanguage: Language;
  numLines: number;
  display: CaptionDisplayMode;
  captionStyle: CaptionStyle;
  captionSizeRatio: number;
};

export type XCaptionStatus = {
  // The video turned on, or null.
  video: HTMLVideoElement | null;
  loading: boolean;
};

const PLAYER_SELECTOR = '[data-testid="videoPlayer"]';
const OVERLAY_HOST_ID = 'shizue-x-caption-overlay';
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
// How long a track may take to fill once shown, and how often it is looked at meanwhile.
const CUE_WAIT_MS = 10_000;
const CUE_POLL_MS = 250;

// The box to draw in: X's player where it marks one (signed in), otherwise the nearest positioned
// element around the video (signed out, X marks nothing).
export const playerOf = (video: HTMLVideoElement): HTMLElement | null => {
  const marked = video.closest<HTMLElement>(PLAYER_SELECTOR);
  if (marked) return marked;
  for (let element = video.parentElement; element && element !== document.body; element = element.parentElement) {
    if (getComputedStyle(element).position !== 'static') return element;
  }
  return null;
};

export const captionTrack = (video: HTMLVideoElement): TextTrack | null =>
  Array.from(video.textTracks).find((track) => track.kind === 'subtitles' || track.kind === 'captions') ?? null;

// A cue's text without its WebVTT tags, on one line.
const cueText = (cue: TextTrackCue) =>
  ((cue as VTTCue).text ?? '').replace(/<[^>]*>/g, '').replace(/\s*\n\s*/g, ' ').trim();

class XCaptions {
  private settings: CaptionSettings | null = null;
  private video: HTMLVideoElement | null = null;
  private track: TextTrack | null = null;
  private trackMode: TextTrackMode = 'disabled';
  private loading = false;
  private waiting = false;
  // Bumped by every activation and deactivation, so a slow load can't land on a newer one.
  private generation = 0;
  private cues: Caption[] = [];
  private translator: CueTranslator | null = null;
  private frame: number | null = null;
  private lastTime = -1;
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  private lastRendered = '';
  private listeners = new Set<(status: XCaptionStatus) => void>();

  subscribe(listener: (status: XCaptionStatus) => void) {
    this.listeners.add(listener);
    listener(this.status());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private status(): XCaptionStatus {
    return { video: this.video, loading: this.loading || this.waiting };
  }

  private emit() {
    const status = this.status();
    this.listeners.forEach((listener) => listener(status));
  }

  // X's own captions button shows the track: keep it hidden while ours show.
  private keepHidden = () => {
    if (this.track && this.track.mode !== 'hidden') this.track.mode = 'hidden';
  };

  async activate(video: HTMLVideoElement, settings: CaptionSettings) {
    this.deactivate();
    const track = captionTrack(video);
    if (!track) return;
    const generation = ++this.generation;
    this.settings = settings;
    this.video = video;
    this.track = track;
    this.trackMode = track.mode;
    this.loading = true;
    track.mode = 'hidden';
    video.textTracks.addEventListener('change', this.keepHidden);
    this.emit();

    const cues = await this.loadCues(track);
    if (generation !== this.generation) return;
    this.loading = false;
    // The track stayed empty: the captions are off again, as they were.
    if (!cues.length) {
      this.deactivate();
      return;
    }
    this.cues = cues;
    this.load(settings);
    this.frame = requestAnimationFrame(this.tick);
    this.emit();
  }

  // The track's cues once they stop arriving, or none if it stays empty.
  private async loadCues(track: TextTrack): Promise<Caption[]> {
    let count = -1;
    for (let waited = 0; waited < CUE_WAIT_MS; waited += CUE_POLL_MS) {
      const current = track.cues?.length ?? 0;
      if (current > 0 && current === count) break;
      count = current;
      await new Promise((resolve) => setTimeout(resolve, CUE_POLL_MS));
    }
    return Array.from(track.cues ?? [])
      .map((cue) => ({ startTime: cue.startTime, endTime: cue.endTime, text: cueText(cue) }))
      .filter((cue) => cue.text);
  }

  // The LLM translates unless the captions are already in the target language.
  private load(settings: CaptionSettings) {
    this.translator?.stop();
    this.translator = null;
    this.lastRendered = '';
    const language = languageCodeToLanguage((this.track?.language ?? '').toLowerCase());
    if (language === settings.targetLanguage) return;
    const cues = this.cues;
    const target = settings.targetLanguage;
    const metadata = { title: this.title() };
    const translator: CueTranslator = createCueTranslator({
      cues,
      translate: async (part, start) => {
        const context = cues
          .slice(Math.max(0, start - CONTEXT_BEFORE), start)
          .map((cue, i, before) => ({
            source: cue.text,
            translation: translator.translation(start - before.length + i) ?? '',
          }));
        const following = cues
          .slice(start + part.length, start + part.length + CONTEXT_AFTER)
          .map((cue) => cue.text);
        const result = await translationService.translateSubtitles(
          part.map((cue) => cue.text),
          context,
          following,
          target,
          metadata
        );
        return result.success && result.translations ? result.translations : null;
      },
      onUpdate: () => {
        this.lastRendered = '';
      },
    });
    translator.setPosition(this.video?.currentTime ?? 0);
    this.translator = translator;
  }

  // The post's text, for the LLM to know what the video is about.
  private title() {
    const post = this.video?.closest('article');
    const text = post?.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
    return text ? text.slice(0, 200) : document.title;
  }

  updateSettings(settings: CaptionSettings) {
    const targetChanged = settings.targetLanguage !== this.settings?.targetLanguage;
    this.settings = settings;
    this.lastRendered = '';
    if (targetChanged && this.cues.length) this.load(settings);
  }

  deactivate() {
    this.generation++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.translator?.stop();
    this.translator = null;
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
    if (this.video) this.video.textTracks.removeEventListener('change', this.keepHidden);
    if (this.track) this.track.mode = this.trackMode;
    const wasActive = this.video !== null;
    this.video = null;
    this.track = null;
    this.cues = [];
    this.loading = false;
    this.waiting = false;
    this.lastTime = -1;
    if (wasActive) this.emit();
  }

  private tick = () => {
    this.frame = null;
    const video = this.video;
    // X drops posts scrolled far out of view.
    if (!video?.isConnected) {
      this.deactivate();
      return;
    }
    const time = video.currentTime;
    if (Math.abs(time - this.lastTime) > 1) this.translator?.setPosition(time);
    this.lastTime = time;
    this.render(time);
    this.frame = requestAnimationFrame(this.tick);
  };

  private ensureOverlay(): Root | null {
    const container = this.video && playerOf(this.video);
    if (!container) return null;
    if (this.host?.parentElement !== container || !this.root) {
      this.root?.unmount();
      this.host?.remove();
      // Inline styles: this element sits in X's DOM, outside our stylesheet.
      const host = document.createElement('div');
      host.id = OVERLAY_HOST_ID;
      Object.assign(host.style, {
        position: 'absolute',
        left: '50%',
        // Above X's control bar.
        bottom: '64px',
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: '90%',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: '1',
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
    }
    return this.root;
  }

  private render(time: number) {
    const settings = this.settings;
    const video = this.video;
    if (!settings || !video) return;
    const root = this.ensureOverlay();
    if (!root) return;

    const index = findCueIndex(this.cues, time);
    const lines: string[] = [];
    const originalLines: string[] = [];
    let waiting = false;
    if (index !== -1) {
      for (let i = Math.max(0, index - settings.numLines + 1); i <= index; i++) {
        const original = this.cues[i].text;
        const translation = this.translator?.translation(i);
        if (this.translator && translation === undefined && i === index) waiting = true;
        // A cue without its translation (yet) shows its original, as on YouTube.
        lines.push(translation || original);
        originalLines.push(translation ? original : '');
      }
    }
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.emit();
    }

    // X's videos are small in a timeline and large when opened: the size follows the player, as
    // YouTube's own captions do (1/22.5 of its height).
    const fontSize = `${Math.round((video.getBoundingClientRect().height / 22.5) * settings.captionSizeRatio)}px`;
    const key = JSON.stringify([lines, originalLines, settings.display, settings.captionStyle, fontSize]);
    if (key === this.lastRendered) return;
    this.lastRendered = key;
    root.render(
      <StrictMode>
        <CaptionDisplay
          lines={lines}
          originalLines={originalLines}
          display={settings.display}
          targetLanguage={settings.targetLanguage}
          captionStyle={settings.captionStyle}
          captionSizeRatio={settings.captionSizeRatio}
          fontSize={fontSize}
        />
      </StrictMode>
    );
  }
}

let instance: XCaptions | null = null;

export const getXCaptions = () => {
  instance ??= new XCaptions();
  return instance;
};
