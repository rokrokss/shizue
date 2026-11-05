import type { Language } from '@/hooks/language';
import { alignCues, parseWebVtt } from '@/lib/netflix/subtitles';
import {
  captionTrack,
  DomCaptionSite,
  isIn,
  loadTrackCaptions,
  LoadedCaptions,
  positionedAround,
  TrackCaptionSite,
} from '@/lib/trackCaptions/tracks';

const hasTrack = (video: HTMLVideoElement) => captionTrack(video) !== null;

// X loads a video's captions (the poster's own subtitle file) as a text track once its stream
// loads. Its player is marked when signed in; signed out, nothing is.
export const xSite: TrackCaptionSite = {
  name: 'x',
  playerOf: (video) => video.closest<HTMLElement>('[data-testid="videoPlayer"]') ?? positionedAround(video),
  hasCaptions: hasTrack,
  // The post's text.
  title: (video) => {
    const text = video.closest('article')?.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
    return text ? text.slice(0, 200) : document.title;
  },
};

const pageTitle = () => document.title.trim().slice(0, 200);

// Coursera's lectures play in video.js, which loads each language's subtitle file as a <track>.
const coursera: TrackCaptionSite = {
  name: 'lecture',
  playerOf: (video) => video.closest<HTMLElement>('.video-js') ?? positionedAround(video),
  hasCaptions: hasTrack,
  title: pageTitle,
  ownCaptions: '.vjs-text-track-display',
  zIndex: 10,
};

// The text of every element `selector` finds under `root`, a line each.
const linesOf = (root: ParentNode | null | undefined, selector: string) =>
  Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? [], (element) => element.innerText ?? element.textContent ?? '')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

// The players below draw their own subtitles; the selectors are those Firefox's Picture-in-Picture
// reads them with (browser/extensions/pictureinpicture/video-wrappers, 2026), not checked on an
// account of our own.

// Udemy's course player draws the cue next to its <video>.
const udemy: DomCaptionSite = {
  name: 'lecture',
  playerOf: positionedAround,
  hasCaptions: () => true,
  cue: (video) => linesOf(video.parentElement, '[data-purpose="captions-cue-text"]'),
  title: pageTitle,
  ownCaptions: '[data-purpose="captions-cue-text"]',
  zIndex: 10,
};

// Disney+: its own renderer in the US, Shaka's elsewhere.
const disneyPlus: DomCaptionSite = {
  name: 'streaming',
  playerOf: positionedAround,
  hasCaptions: () => location.pathname.includes('/play/') || location.pathname.includes('/video/'),
  cue: () =>
    linesOf(document.querySelector('.TimedTextOverlay'), '.hive-subtitle-renderer-line') ||
    linesOf(document.querySelector('.shaka-text-container'), 'span'),
  title: () => pageTitle().replace(/\s*\|\s*Disney\+.*$/i, ''),
  ownCaptions: '.TimedTextOverlay, .shaka-text-container',
  zIndex: 10,
};

// Prime Video, on primevideo.com and amazon.*/gp/video.
const primeVideo: DomCaptionSite = {
  name: 'streaming',
  playerOf: (video) => video.closest<HTMLElement>('.atvwebplayersdk-player-container') ?? positionedAround(video),
  hasCaptions: (video) => video.closest('#dv-web-player') !== null,
  cue: () => {
    const player = document.querySelector('#dv-web-player');
    return linesOf(player, '.atvwebplayersdk-captions-text') || linesOf(player?.querySelector('.persistentPanel'), 'span');
  },
  title: () => pageTitle().replace(/^(?:Prime Video|Amazon\.[a-z.]+):\s*/i, ''),
  ownCaptions: '.atvwebplayersdk-captions-text, #dv-web-player .persistentPanel',
  zIndex: 10,
};

// HBO Max (play.hbomax.com, formerly play.max.com).
const max: DomCaptionSite = {
  name: 'streaming',
  playerOf: positionedAround,
  hasCaptions: () => location.pathname.startsWith('/video/') || location.pathname.startsWith('/player/'),
  cue: () => linesOf(document, '[data-testid="CueBoxContainer"]'),
  title: () => pageTitle().replace(/\s*[•|-]\s*(?:HBO )?Max\s*$/i, ''),
  ownCaptions: '[data-testid="CueBoxContainer"]',
  zIndex: 10,
};

// Vimeo's player (on vimeo.com and embedded anywhere as player.vimeo.com) adds a <track> per
// language to its <video> (telecine-track-<id>) and draws the cues itself in .vp-captions. Its
// controls are a layer of their own over the video, so the overlay goes in the player's root.
const vimeo: TrackCaptionSite = {
  name: 'lecture',
  playerOf: (video) => video.closest<HTMLElement>('.vp-video-wrapper')?.parentElement ?? positionedAround(video),
  hasCaptions: hasTrack,
  title: () => pageTitle().replace(/\s+(?:on|from) Vimeo$/i, ''),
  ownCaptions: '.vp-captions',
  zIndex: 10,
};

type TedSubtitle = { code: string; webvtt: string };

const fetchVtt = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TED subtitles: ${response.status}`);
  return parseWebVtt(await response.text());
};

// TED's player draws the subtitles itself, from one full WebVTT file per language listed in the
// talk's metadata.json, timed to the stream (its intro included). The talk page names that file
// and the language spoken. The page is fetched again rather than read, because moving between
// talks in the page doesn't update its data. Its translations are made by TED's volunteers, so
// one in the target language is used as it is.
export const loadTedCaptions = async (target: Language, pageUrl = location.href): Promise<LoadedCaptions | null> => {
  const html = await (await fetch(pageUrl, { credentials: 'include' })).text();
  const data = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!data) return null;
  const videoData = JSON.parse(data)?.props?.pageProps?.videoData;
  const raw = videoData?.videoPlayerData;
  const player = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const metadataUrl: string | undefined = player?.resources?.hls?.metadata;
  if (!metadataUrl) return null;
  const metadata = await (await fetch(metadataUrl)).json();
  const subtitles: TedSubtitle[] = (metadata?.subtitles ?? []).filter((sub: TedSubtitle) => sub?.code && sub?.webvtt);
  const spoken: string = player?.nativeLanguage || videoData?.audioInternalLanguageCode || 'en';
  const original =
    subtitles.find((sub) => sub.code === spoken) ??
    subtitles.find((sub) => sub.code.split('-')[0] === spoken.split('-')[0]) ??
    subtitles.find((sub) => sub.code.startsWith('en')) ??
    subtitles[0];
  if (!original) return null;
  const translated = isIn(original.code, target)
    ? undefined
    : subtitles.find((sub) => sub !== original && isIn(sub.code, target));
  const [cues, targetCues] = await Promise.all([
    fetchVtt(original.webvtt),
    translated ? fetchVtt(translated.webvtt).catch(() => []) : Promise.resolve([]),
  ]);
  if (!cues.length) return null;
  if (!targetCues.length) return { cues, language: original.code };
  return { ...alignCues(cues, targetCues), language: original.code };
};

const isTalkPage = () => /^\/talks\/[^/]+/.test(location.pathname);

const ted: TrackCaptionSite = {
  name: 'lecture',
  playerOf: positionedAround,
  hasCaptions: () => isTalkPage(),
  load: async (video, target) => (await loadTedCaptions(target).catch(() => null)) ?? loadTrackCaptions(video, target),
  title: () => pageTitle().replace(/\s*\|\s*TED Talk\s*$/i, ''),
  overlayBottom: 72,
  // TED may start a talk with its own subtitles on, drawn where ours go.
  ownCaptions: '#subtitles-container',
  zIndex: 10,
};

// Any other page whose video has a caption <track> (entrypoints/track-caption.content). The
// browser draws a track that is showing; ours replace it while on (trackCaptions.tsx hides it).
export const anyTrackSite: TrackCaptionSite = {
  name: 'video',
  playerOf: positionedAround,
  hasCaptions: hasTrack,
  title: pageTitle,
  zIndex: 10,
};

// The streaming service this page is on, if any.
export const streamingSiteFor = (hostname: string, pathname: string): DomCaptionSite | null => {
  const host = hostname.replace(/^www\./, '');
  if (host === 'disneyplus.com' || host.endsWith('.disneyplus.com')) return disneyPlus;
  if (host === 'primevideo.com' || host.endsWith('.primevideo.com')) return primeVideo;
  if (/^amazon\.(?:com|co\.uk|de|co\.jp|fr|it|es|ca|com\.au|com\.br|in|com\.mx)$/.test(host) && pathname.startsWith('/gp/video')) {
    return primeVideo;
  }
  if (host === 'play.hbomax.com' || host === 'play.max.com') return max;
  return null;
};

export const isDomCaptionSite = (site: TrackCaptionSite | DomCaptionSite): site is DomCaptionSite => 'cue' in site;

// The lecture site this page is on, if any.
export const lectureSiteFor = (hostname: string): TrackCaptionSite | DomCaptionSite | null => {
  const host = hostname.replace(/^www\./, '');
  if (host === 'coursera.org') return coursera;
  if (host === 'udemy.com' || host.endsWith('.udemy.com')) return udemy;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return vimeo;
  if (host === 'ted.com') return ted;
  return null;
};
