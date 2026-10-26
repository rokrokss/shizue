import tailwindRaw from '@/assets/tailwind.css?inline';
import { CaptionDisplay } from '@/components/Youtube/CaptionDisplay';
import type { Language } from '@/hooks/language';
import {
  BRIDGE_TO_CONTENT_EVENT,
  CONTENT_TO_BRIDGE_EVENT,
  NetflixTrack,
  parseBridgeMessage,
} from '@/lib/netflix/bridgeProtocol';
import { createCueTranslator, CueTranslator } from '@/lib/netflix/cueTranslator';
import { alignCues, findCueIndex, parseSubtitles } from '@/lib/netflix/subtitles';
import { isTrackIn, pickOriginalTrack, pickTargetTrack } from '@/lib/netflix/tracks';
import type { Caption } from '@/lib/youtube';
import { debugLog, errorLog } from '@/logs';
import { translationService } from '@/services/translationService';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';

export type CaptionSettings = {
  targetLanguage: Language;
  numLines: number;
  bilingual: boolean;
  captionSizeRatio: number;
};

export type NetflixCaptionStatus = {
  // A title is playing and has text subtitles.
  available: boolean;
  tracks: NetflixTrack[];
  // The track shown as the original: the viewer's pick, else the one in the spoken language.
  originalTrackId: string | null;
  active: boolean;
  loading: boolean;
  // The original subtitles couldn't be loaded.
  failed: boolean;
  adPlaying: boolean;
};

const OVERLAY_HOST_ID = 'shizue-netflix-caption-overlay';
const HIDE_NATIVE_STYLE_ID = 'shizue-netflix-hide-native-captions';
// Netflix's text and image subtitles.
const NATIVE_CAPTIONS = '.player-timedtext, .image-based-timed-text, .image-based-subtitles';
// The ad plan's "Ad · 0:15" box (as of 2026-10, per Subtiltee's selectors; not seen here).
const AD_SELECTOR =
  '[data-uia="ads-info-container"], [data-uia="ads-info-text"], .watch-video--adsInfo-container';
const BRIDGE_ANSWER_TIMEOUT_MS = 20_000;
// The translator learns the playback position this often (and at once after a seek).
const POSITION_INTERVAL_MS = 500;
// Lines sent with each LLM request as context: translated ones before it, upcoming ones after.
const CONTEXT_BEFORE = 5;
const CONTEXT_AFTER = 3;
// The overlay follows Netflix's control row this often.
const PLACE_INTERVAL_MS = 250;

const isWatchPage = () => location.pathname.startsWith('/watch');

export const playerVideo = () =>
  document.querySelector<HTMLVideoElement>('.watch-video video') ?? document.querySelector('video');

// What the viewer picked as the original, kept across episodes, whose track IDs differ.
type OriginalChoice = { language: string; closedCaptions: boolean };

class NetflixCaptions {
  private settings: CaptionSettings | null = null;
  private active = false;
  private loading = false;
  // The cue on screen waits for its LLM translation.
  private waiting = false;
  private failed = false;
  private adPlaying = false;
  private movieId: number | null = null;
  private title: string | null = null;
  private audioLanguage: string | null = null;
  private tracks: NetflixTrack[] = [];
  private originalChoice: OriginalChoice | null = null;
  // Bumped by every activation and deactivation, so a slow load can't land on a newer one.
  private generation = 0;
  // wantedKey() of what is loaded or loading.
  private loadedKey: string | null = null;
  private cues: Caption[] = [];
  // One per cue: official subtitles aligned to the cues; null when the LLM translates instead, or
  // when the original is already in the target language.
  private officialTranslations: string[] | null = null;
  // The target language's official subtitles are on their way.
  private officialPending = false;
  private translator: CueTranslator | null = null;
  private frame: number | null = null;
  private lastPositionAt = 0;
  private lastPlacedAt = 0;
  private lastTime = 0;
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  private lastRendered = '';
  private listeners = new Set<(status: NetflixCaptionStatus) => void>();
  private requestSequence = 0;
  private pendingTracks = new Map<number, (url: string | null) => void>();
  private pongWaiters: (() => void)[] = [];

  constructor() {
    window.addEventListener(BRIDGE_TO_CONTENT_EVENT, (event) => {
      const message = parseBridgeMessage((event as CustomEvent).detail);
      if (!message) return;
      if (message.type === 'pong') {
        this.pongWaiters.splice(0).forEach((resolve) => resolve());
      } else if (message.type === 'track') {
        this.pendingTracks.get(message.requestId)?.(message.url);
        this.pendingTracks.delete(message.requestId);
      } else if (message.type === 'state') {
        this.handleState(message.movieId, message.title, message.audioLanguage, message.tracks);
      }
    });
  }

  subscribe(listener: (status: NetflixCaptionStatus) => void) {
    this.listeners.add(listener);
    listener(this.status());
    return () => {
      this.listeners.delete(listener);
    };
  }

  status(): NetflixCaptionStatus {
    return {
      available: isWatchPage() && this.tracks.length > 0,
      tracks: this.tracks,
      originalTrackId: this.originalTrack()?.trackId ?? null,
      active: this.active,
      loading: this.loading || this.waiting,
      failed: this.failed,
      adPlaying: this.adPlaying,
    };
  }

  private emit() {
    const status = this.status();
    this.listeners.forEach((listener) => listener(status));
  }

  // Whether the bridge runs in the page; tabs open before an install don't have it.
  pingBridge(timeoutMs = 1000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.pongWaiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
      window.dispatchEvent(new CustomEvent(CONTENT_TO_BRIDGE_EVENT, { detail: JSON.stringify({ type: 'ping' }) }));
    });
  }

  private requestTrack(trackId: string): Promise<string | null> {
    const requestId = ++this.requestSequence;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingTracks.delete(requestId);
        resolve(null);
      }, BRIDGE_ANSWER_TIMEOUT_MS);
      this.pendingTracks.set(requestId, (url) => {
        clearTimeout(timer);
        resolve(url);
      });
      window.dispatchEvent(
        new CustomEvent(CONTENT_TO_BRIDGE_EVENT, { detail: JSON.stringify({ type: 'load', requestId, trackId }) })
      );
    });
  }

  private originalTrack(): NetflixTrack | null {
    const choice = this.originalChoice;
    if (choice) {
      const chosen =
        this.tracks.find((t) => t.language === choice.language && t.closedCaptions === choice.closedCaptions) ??
        this.tracks.find((t) => t.language === choice.language);
      if (chosen) return chosen;
    }
    return pickOriginalTrack(this.tracks, this.audioLanguage);
  }

  // Whether captions in this language would need the LLM: no official subtitles in it, and the
  // original isn't already in it.
  needsModel(target: Language): boolean {
    const original = this.originalTrack();
    if (original && isTrackIn(original, target)) return false;
    return !pickTargetTrack(this.tracks, target);
  }

  private handleState(movieId: number | null, title: string | null, audioLanguage: string | null, tracks: NetflixTrack[]) {
    const movieChanged = movieId !== this.movieId;
    const tracksChanged = JSON.stringify(tracks) !== JSON.stringify(this.tracks);
    const audioChanged = audioLanguage !== this.audioLanguage;
    this.title = title;
    if (!movieChanged && !tracksChanged && !audioChanged) return;
    this.movieId = movieId;
    this.tracks = tracks;
    this.audioLanguage = audioLanguage;
    // The next episode plays on its own in the same page, and the viewer may switch the audio to a
    // dub: keep captions on, with the original that now fits. The old title's lines go at once;
    // its tracks can take a moment to be listed.
    if (this.active && this.settings) {
      if (movieChanged) this.resetCues();
      if (tracks.length && this.loadedKey !== this.wantedKey()) void this.load(this.settings);
    }
    this.emit();
  }

  // What load() would show: the title, its original track and the target language.
  private wantedKey() {
    return JSON.stringify([this.movieId, this.originalTrack()?.trackId ?? null, this.settings?.targetLanguage]);
  }

  updateSettings(settings: CaptionSettings) {
    this.settings = settings;
    if (this.active && this.loadedKey !== this.wantedKey()) void this.load(settings);
    this.lastRendered = '';
  }

  // Shows these subtitles as the original from now on (and on later episodes).
  setOriginalTrack(trackId: string) {
    const track = this.tracks.find((t) => t.trackId === trackId);
    if (!track) return;
    this.originalChoice = { language: track.language, closedCaptions: track.closedCaptions };
    if (this.active && this.settings && this.loadedKey !== this.wantedKey()) void this.load(this.settings);
    this.emit();
  }

  activate(settings: CaptionSettings) {
    this.settings = settings;
    this.active = true;
    this.setNativeCaptionsHidden(true);
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick);
    void this.load(settings);
  }

  deactivate() {
    this.generation++;
    this.active = false;
    this.loading = false;
    this.failed = false;
    // Ads are watched only while active; a stale flag would keep the button hidden.
    this.adPlaying = false;
    this.resetCues();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.root?.unmount();
    this.root = null;
    this.host?.remove();
    this.host = null;
    this.setNativeCaptionsHidden(false);
    this.emit();
  }

  private resetCues() {
    this.loadedKey = null;
    this.translator?.stop();
    this.translator = null;
    this.cues = [];
    this.officialTranslations = null;
    this.officialPending = false;
    this.waiting = false;
    this.lastRendered = '';
  }

  private async fetchCues(trackId: string): Promise<Caption[] | null> {
    const url = await this.requestTrack(trackId);
    if (!url) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const cues = parseSubtitles(await response.text());
      return cues.length ? cues : null;
    } catch (error) {
      errorLog('[Netflix] subtitle download failed', error);
      return null;
    }
  }

  private async load(settings: CaptionSettings) {
    const generation = ++this.generation;
    this.resetCues();
    this.loadedKey = this.wantedKey();
    this.loading = true;
    this.failed = false;
    this.emit();

    const original = this.originalTrack();
    const cues = original ? await this.fetchCues(original.trackId) : null;
    if (generation !== this.generation) return;
    if (!original || !cues) {
      debugLog('[Netflix] no original subtitles for', this.movieId);
      this.loading = false;
      this.failed = true;
      this.emit();
      return;
    }

    // The original shows right away. Getting the target track's link can take seconds more (the
    // player switches to it), and its lines fill in when it arrives, as LLM translations do.
    const target = settings.targetLanguage;
    const sameLanguage = isTrackIn(original, target);
    const targetTrack = sameLanguage ? null : pickTargetTrack(this.tracks, target);
    this.cues = cues;
    this.officialPending = Boolean(targetTrack);
    this.loading = false;
    this.lastRendered = '';
    this.emit();
    if (targetTrack) {
      const targetCues = await this.fetchCues(targetTrack.trackId);
      if (generation !== this.generation) return;
      this.officialPending = false;
      this.lastRendered = '';
      if (targetCues) {
        const aligned = alignCues(cues, targetCues);
        this.cues = aligned.cues;
        this.officialTranslations = aligned.translations;
        return;
      }
    }
    if (!sameLanguage) this.translator = this.createTranslator(cues, target);
  }

  // The LLM translates when Netflix has no subtitles in the target language. Each request carries
  // the lines just before (with their translations) and after it as context.
  private createTranslator(cues: Caption[], target: Language): CueTranslator {
    const metadata = { title: this.title ?? document.title };
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
    this.lastPositionAt = 0;
    return translator;
  }

  private setNativeCaptionsHidden(hidden: boolean) {
    const existing = document.getElementById(HIDE_NATIVE_STYLE_ID);
    if (!hidden) {
      existing?.remove();
      return;
    }
    if (existing) return;
    // A stylesheet rule, not an inline style: Netflix redraws its subtitle box on every cue.
    const style = document.createElement('style');
    style.id = HIDE_NATIVE_STYLE_ID;
    style.textContent = `${NATIVE_CAPTIONS} { visibility: hidden !important; }`;
    document.head.append(style);
  }

  // A cue's translation: official, the LLM's (undefined while pending, '' if it failed), or none
  // when the original is already in the target language.
  private translationOf(index: number): string | null | undefined {
    if (this.officialPending) return undefined;
    if (this.officialTranslations) return this.officialTranslations[index];
    if (this.translator) return this.translator.translation(index);
    return null;
  }

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    if (!isWatchPage()) {
      this.deactivate();
      return;
    }
    const adPlaying = Boolean(document.querySelector(AD_SELECTOR));
    if (adPlaying !== this.adPlaying) {
      this.adPlaying = adPlaying;
      this.emit();
    }
    const video = playerVideo();
    const time = video?.currentTime ?? 0;
    const now = Date.now();
    // After a seek, translate around the new position right away.
    if (this.translator && (now - this.lastPositionAt > POSITION_INTERVAL_MS || Math.abs(time - this.lastTime) > 2)) {
      this.translator.setPosition(time);
      this.lastPositionAt = now;
    }
    this.lastTime = time;
    this.render(adPlaying ? -1 : time);
  };

  // Puts the overlay in the player view, which stays visible in fullscreen. It moves up while
  // Netflix's controls are showing, as Netflix's own subtitles do.
  private ensureOverlay(): Root | null {
    const container =
      document.querySelector<HTMLElement>('.watch-video--player-view') ??
      document.querySelector<HTMLElement>('[data-uia="player"]') ??
      playerVideo()?.parentElement;
    if (!container) return null;
    if (!this.host?.isConnected || this.host.parentElement !== container || !this.root) {
      this.root?.unmount();
      this.host?.remove();
      // Inline styles: this element sits in Netflix's DOM, outside our stylesheet.
      const host = document.createElement('div');
      host.id = OVERLAY_HOST_ID;
      Object.assign(host.style, {
        position: 'absolute',
        left: '50%',
        bottom: '10%',
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: '90%',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: '10',
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
      this.lastPlacedAt = 0;
    }
    // Layout reads force a reflow while Netflix fades its controls, so not every frame.
    const now = Date.now();
    if (now - this.lastPlacedAt < PLACE_INTERVAL_MS) return this.root;
    this.lastPlacedAt = now;
    const controls = container.querySelector<HTMLElement>('[data-uia="controls-standard"]');
    const controlsTop = controls?.getBoundingClientRect().top ?? 0;
    const containerRect = container.getBoundingClientRect();
    const raise = controls && controlsTop > containerRect.top ? containerRect.bottom - controlsTop + 8 : 0;
    const bottom = `${Math.round(Math.max(containerRect.height * 0.1, raise))}px`;
    if (this.host.style.bottom !== bottom) this.host.style.bottom = bottom;
    return this.root;
  }

  private render(time: number) {
    const settings = this.settings;
    if (!settings) return;
    const root = this.ensureOverlay();
    if (!root) return;

    const index = time < 0 ? -1 : findCueIndex(this.cues, time);
    const lines: string[] = [];
    const originalLines: string[] = [];
    let waiting = false;
    if (index !== -1) {
      for (let i = Math.max(0, index - settings.numLines + 1); i <= index; i++) {
        const original = this.cues[i].text;
        const translation = this.translationOf(i);
        if (translation === undefined && i === index) waiting = true;
        // A cue without its translation (yet) shows its original, as on YouTube.
        lines.push(translation || original);
        originalLines.push(translation ? original : '');
      }
    }
    // The button spins while the line on screen waits for the LLM, as on YouTube.
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.emit();
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

let instance: NetflixCaptions | null = null;

export const getNetflixCaptions = () => {
  instance ??= new NetflixCaptions();
  return instance;
};
