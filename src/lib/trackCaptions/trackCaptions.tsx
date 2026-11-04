import type { Language } from '@/hooks/language';
import type { CaptionDisplayMode, CaptionStyle } from '@/hooks/layout';
import { createCueTranslator, CueTranslator } from '@/lib/netflix/cueTranslator';
import { CaptionOverlay, createCaptionOverlay } from '@/lib/trackCaptions/overlay';
import { findCueIndex } from '@/lib/netflix/subtitles';
import {
  captionTracks,
  isIn,
  loadTrackCaptions,
  type LoadedCaptions,
  type TrackCaptionSite,
} from '@/lib/trackCaptions/tracks';
import type { Caption } from '@/lib/youtube';
import { translationService } from '@/services/translationService';

export type { TrackCaptionSite } from '@/lib/trackCaptions/tracks';

// Captions for a page's own <video>: X's posts, and lecture sites (Coursera, Udemy, Vimeo, TED).
// Most of these players load their subtitle files as text tracks, which load all their cues once
// shown or hidden; a site can read its files another way (`TrackCaptionSite.load`). The site's own
// captions are hidden while ours show. When the video has subtitles in the target language, those
// are the translation, as on Netflix; otherwise the LLM translates the cues in chunks from the
// playback position, with the lines around each chunk as context.

export type CaptionSettings = {
  targetLanguage: Language;
  numLines: number;
  display: CaptionDisplayMode;
  captionStyle: CaptionStyle;
  captionSizeRatio: number;
  // Subtitles read off the screen (domCaptions.tsx): Chrome's translator first, whether the chat
  // model can stand in, and the line shown until the site's subtitles are on.
  chromeTranslation?: boolean;
  modelAvailable?: boolean;
  hint?: string;
};

// What the caption button drives: this controller, or the one for subtitles read off the screen.
export type VideoCaptionController = {
  subscribe: (listener: (status: TrackCaptionStatus) => void) => () => void;
  activate: (video: HTMLVideoElement, settings: CaptionSettings) => unknown;
  updateSettings: (settings: CaptionSettings) => void;
  deactivate: () => void;
  // Translates each line as it shows, so Chrome's on-device translator is offered.
  translatesLive?: boolean;
};

export type TrackCaptionStatus = {
  // The video turned on, or null.
  video: HTMLVideoElement | null;
  loading: boolean;
};

const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;

class TrackCaptions {
  private settings: CaptionSettings | null = null;
  private video: HTMLVideoElement | null = null;
  // The caption tracks' modes before ours were turned on, put back after.
  private trackModes = new Map<TextTrack, TextTrackMode>();
  private language = '';
  private loading = false;
  private waiting = false;
  // Bumped by every activation and deactivation, so a slow load can't land on a newer one.
  private generation = 0;
  private cues: Caption[] = [];
  private siteTranslations: string[] | null = null;
  private translator: CueTranslator | null = null;
  private frame: number | null = null;
  private lastTime = -1;
  private overlay: CaptionOverlay;
  private hideStyle: HTMLStyleElement | null = null;
  private listeners = new Set<(status: TrackCaptionStatus) => void>();

  constructor(private site: TrackCaptionSite) {
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
    return { video: this.video, loading: this.loading || this.waiting };
  }

  private emit() {
    const status = this.status();
    this.listeners.forEach((listener) => listener(status));
  }

  // The player's own captions button shows a track: keep it hidden while ours show.
  private keepHidden = () => {
    if (!this.video) return;
    for (const track of captionTracks(this.video)) {
      if (!this.trackModes.has(track)) this.trackModes.set(track, track.mode);
      if (track.mode === 'showing') track.mode = 'hidden';
    }
  };

  async activate(video: HTMLVideoElement, settings: CaptionSettings) {
    this.deactivate();
    if (!this.site.hasCaptions(video)) return;
    const generation = ++this.generation;
    this.settings = settings;
    this.video = video;
    this.loading = true;
    this.keepHidden();
    video.textTracks.addEventListener('change', this.keepHidden);
    if (this.site.ownCaptions) {
      const style = document.createElement('style');
      style.textContent = `${this.site.ownCaptions} { display: none !important; }`;
      document.head.append(style);
      this.hideStyle = style;
    }
    this.emit();

    const loaded = await this.loadCaptions(video, settings.targetLanguage);
    if (generation !== this.generation) return;
    this.loading = false;
    // No captions after all: off again, as they were.
    if (!loaded?.cues.length) {
      this.deactivate();
      return;
    }
    this.apply(loaded, settings);
    this.frame = requestAnimationFrame(this.tick);
    this.emit();
  }

  private async loadCaptions(video: HTMLVideoElement, target: Language) {
    try {
      return await (this.site.load ?? loadTrackCaptions)(video, target);
    } catch {
      return null;
    }
  }

  private apply(loaded: LoadedCaptions, settings: CaptionSettings) {
    this.cues = loaded.cues;
    this.language = loaded.language;
    this.siteTranslations = loaded.translations ?? null;
    this.startTranslator(settings);
  }

  // The LLM translates unless the captions are in the target language already, or the site has
  // them in it.
  private startTranslator(settings: CaptionSettings) {
    this.translator?.stop();
    this.translator = null;
    this.overlay.invalidate();
    if (this.siteTranslations || isIn(this.language, settings.targetLanguage)) return;
    const cues = this.cues;
    const target = settings.targetLanguage;
    const metadata = { title: this.video ? this.site.title(this.video) : document.title };
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
        this.overlay.invalidate();
      },
    });
    translator.setPosition(this.video?.currentTime ?? 0);
    this.translator = translator;
  }

  updateSettings(settings: CaptionSettings) {
    const targetChanged = settings.targetLanguage !== this.settings?.targetLanguage;
    this.settings = settings;
    this.overlay.invalidate();
    if (!targetChanged || !this.cues.length || !this.video) return;
    // The site's translation was in the old target: read again for the new one.
    if (this.siteTranslations || this.site.load) {
      const video = this.video;
      const generation = this.generation;
      this.loading = true;
      this.emit();
      void this.loadCaptions(video, settings.targetLanguage).then((loaded) => {
        if (generation !== this.generation) return;
        this.loading = false;
        if (loaded?.cues.length) this.apply(loaded, settings);
        this.emit();
      });
      return;
    }
    this.startTranslator(settings);
  }

  deactivate() {
    this.generation++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.translator?.stop();
    this.translator = null;
    this.overlay.remove();
    this.hideStyle?.remove();
    this.hideStyle = null;
    if (this.video) this.video.textTracks.removeEventListener('change', this.keepHidden);
    this.trackModes.forEach((mode, track) => (track.mode = mode));
    this.trackModes.clear();
    const wasActive = this.video !== null;
    this.video = null;
    this.cues = [];
    this.siteTranslations = null;
    this.language = '';
    this.loading = false;
    this.waiting = false;
    this.lastTime = -1;
    if (wasActive) this.emit();
  }

  private tick = () => {
    this.frame = null;
    const video = this.video;
    // The page dropped the video (X removes posts scrolled far away; a lecture site moves on).
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

  private translationAt(index: number) {
    return this.siteTranslations ? this.siteTranslations[index] : this.translator?.translation(index);
  }

  private render(time: number) {
    const settings = this.settings;
    const video = this.video;
    if (!settings || !video) return;
    const index = findCueIndex(this.cues, time);
    const lines: string[] = [];
    const originalLines: string[] = [];
    let waiting = false;
    if (index !== -1) {
      for (let i = Math.max(0, index - settings.numLines + 1); i <= index; i++) {
        const original = this.cues[i].text;
        const translation = this.translationAt(i);
        if (this.translator && translation === undefined && i === index) waiting = true;
        // A cue without its translation (yet) shows its original, as on YouTube. A line only in
        // the site's translation (a sign) has no original.
        lines.push(translation || original);
        originalLines.push(translation && original ? original : '');
      }
    }
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.emit();
    }

    this.overlay.render(video, lines, originalLines, settings);
  }
}

export type TrackCaptionController = TrackCaptions;

const instances = new Map<string, TrackCaptions>();

// One controller per site, shared by its button and the page.
export const getTrackCaptions = (site: TrackCaptionSite) => {
  let instance = instances.get(site.name);
  if (!instance) {
    instance = new TrackCaptions(site);
    instances.set(site.name, instance);
  }
  return instance;
};
