import type { Language } from '@/hooks/language';
import { languageCodeToLanguage } from '@/lib/language';
import { alignCues, normalizeCues } from '@/lib/netflix/subtitles';
import type { Caption } from '@/lib/youtube';

// What a site tells the caption controller (trackCaptions.tsx), and reading captions from a
// video's text tracks. No React here, so tests can load it.

// A video's captions: the original cues and their language (a BCP 47 tag), and the site's own
// translation of each cue when it has the target language.
export type LoadedCaptions = {
  cues: Caption[];
  language: string;
  translations?: string[];
};

export type TrackCaptionSite = {
  // Names the page elements: shizue-<name>-caption-…
  name: string;
  // The box the overlay and the button are drawn in.
  playerOf: (video: HTMLVideoElement) => HTMLElement | null;
  // The button is offered on this video.
  hasCaptions: (video: HTMLVideoElement) => boolean;
  // Reads the captions; by default from the video's text tracks (loadTrackCaptions).
  load?: (video: HTMLVideoElement, target: Language) => Promise<LoadedCaptions | null>;
  // What the video is about, for the LLM.
  title: (video: HTMLVideoElement) => string;
  // The overlay's distance from the player's bottom, above its control bar.
  overlayBottom?: number;
  // The site's own caption box, hidden while ours show.
  ownCaptions?: string;
  // The overlay's stacking order in the player; the button goes one above it.
  zIndex?: number;
};

// A player that draws its subtitles itself, with no text track to read ahead (Disney+, Prime Video,
// Max, Udemy): the line on screen is read as it changes (domCaptions.tsx).
export type DomCaptionSite = Omit<TrackCaptionSite, 'load'> & {
  // The subtitle on screen now, '' when there is none.
  cue: (video: HTMLVideoElement) => string;
};

// How long a track may take to fill once shown, and how often it is looked at meanwhile.
const CUE_WAIT_MS = 10_000;
const CUE_POLL_MS = 250;

// The nearest positioned element around the video: the box its player draws in.
export const positionedAround = (video: HTMLVideoElement): HTMLElement | null => {
  for (let element = video.parentElement; element && element !== document.body; element = element.parentElement) {
    if (getComputedStyle(element).position !== 'static') return element;
  }
  return null;
};

export const captionTracks = (video: HTMLVideoElement) =>
  Array.from(video.textTracks).filter((track) => track.kind === 'subtitles' || track.kind === 'captions');

export const captionTrack = (video: HTMLVideoElement): TextTrack | null => captionTracks(video)[0] ?? null;

// A language tag as BCP 47 writes it (zh-tw → zh-TW), which languageCodeToLanguage reads.
export const languageTag = (code: string) =>
  code.replace(/[-_]([a-z0-9]+)$/i, (_, region: string) => `-${region.length <= 3 ? region.toUpperCase() : region}`);

export const isIn = (code: string, language: Language) => languageCodeToLanguage(languageTag(code)) === language;

// A cue's text without its WebVTT tags, on one line.
const cueText = (cue: TextTrackCue) =>
  ((cue as VTTCue).text ?? '').replace(/<[^>]*>/g, '').replace(/\s*\n\s*/g, ' ').trim();

// The track's cues once they stop arriving, or none if it stays empty.
const loadCues = async (track: TextTrack): Promise<Caption[]> => {
  if (track.mode === 'disabled') track.mode = 'hidden';
  let count = -1;
  for (let waited = 0; waited < CUE_WAIT_MS; waited += CUE_POLL_MS) {
    const current = track.cues?.length ?? 0;
    if (current > 0 && current === count) break;
    count = current;
    await new Promise((resolve) => setTimeout(resolve, CUE_POLL_MS));
  }
  return normalizeCues(
    Array.from(track.cues ?? [])
      .map((cue) => ({ startTime: cue.startTime, endTime: cue.endTime, text: cueText(cue) }))
      .filter((cue) => cue.text)
  );
};

// The original is the track the viewer has on, else one in English, else the first, leaving out
// tracks in the target language while there are others. A track in the target language, if any,
// is the translation.
export const loadTrackCaptions = async (
  video: HTMLVideoElement,
  target: Language
): Promise<LoadedCaptions | null> => {
  const tracks = captionTracks(video);
  const others = tracks.filter((track) => !isIn(track.language, target));
  const pool = others.length ? others : tracks;
  const original =
    pool.find((track) => track.mode === 'showing') ??
    pool.find((track) => track.language.toLowerCase().startsWith('en')) ??
    pool[0];
  if (!original) return null;
  const translated = others.length ? tracks.find((track) => isIn(track.language, target)) : undefined;
  const [cues, targetCues] = await Promise.all([
    loadCues(original),
    translated ? loadCues(translated) : Promise.resolve([]),
  ]);
  if (!cues.length) return null;
  if (!targetCues.length) return { cues, language: original.language };
  return { ...alignCues(cues, targetCues), language: original.language };
};
