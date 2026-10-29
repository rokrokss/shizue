import type { Caption } from '@/lib/youtube';

// A YouTube video's or Netflix title's details and captions, read in its tab for the side panel's
// chat (and, on YouTube, page summaries), and the times in answers that point back into the video.

export interface VideoTranscript {
  videoId: string;
  // The watch page's address.
  url: string;
  title: string;
  // The channel and description; empty on Netflix.
  author: string;
  description: string;
  // Null for a video without captions, a live stream, or captions that couldn't be read.
  captions: Caption[] | null;
}

// The video a YouTube watch page shows, or null for any other page.
export const youtubeVideoId = (url: string | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['youtube.com', 'www.youtube.com'].includes(parsed.hostname)) return null;
    if (parsed.pathname !== '/watch') return null;
    return parsed.searchParams.get('v') || null;
  } catch {
    return null;
  }
};

// The title a Netflix watch page plays (/watch/<movie ID>), or null for any other page.
export const netflixVideoId = (url: string | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.netflix.com') return null;
    return parsed.pathname.match(/^\/watch\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
};

// Which video a watch page shows, as "youtube:<id>" or "netflix:<id>", or null for any other page.
// Answers' [12:34] times play it from there (lib/videoSeek.ts).
export const videoKey = (url: string | undefined) => {
  const youtube = youtubeVideoId(url);
  if (youtube) return `youtube:${youtube}`;
  const netflix = netflixVideoId(url);
  return netflix ? `netflix:${netflix}` : null;
};

// 75 → "1:15", 3723 → "1:02:03".
export const formatVideoTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

// "1:15" → 75, or null when it isn't a time.
export const parseVideoTime = (time: string) => {
  const parts = time.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }
  if (parts.slice(1).some((part) => part > 59)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

// Captions a few seconds apart are joined into one line under the first one's time: precise
// enough to jump to, with fewer tokens spent on times.
const LINE_SECONDS = 15;
const LINE_CHARS = 300;
const MAX_DESCRIPTION_CHARS = 2_000;

export const transcriptText = (transcript: VideoTranscript) => {
  const lines: string[] = [];
  let start = 0;
  let parts: string[] = [];
  const flush = () => {
    if (parts.length) lines.push(`[${formatVideoTime(start)}] ${parts.join(' ')}`);
    parts = [];
  };
  for (const caption of transcript.captions ?? []) {
    const text = caption.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (
      parts.length &&
      (caption.startTime - start >= LINE_SECONDS || parts.join(' ').length + text.length > LINE_CHARS)
    ) {
      flush();
    }
    if (!parts.length) start = caption.startTime;
    parts.push(text);
  }
  flush();
  const description = transcript.description.trim().slice(0, MAX_DESCRIPTION_CHARS);
  const details = `${transcript.author ? `channel: ${transcript.author}\n` : ''}${
    description ? `description: ${description}\n` : ''
  }`;
  return `${details ? `${details}\n` : ''}captions:
${lines.join('\n')}`;
};

// The video's address that starts playing at `seconds`.
export const videoTimeUrl = (videoId: string, seconds: number) =>
  `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(seconds)}s`;

const CODE_OR_TIME = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\[((?:\d{1,2}:)?\d{1,2}:\d{2})\](?!\()/g;

// Turns the [12:34] times an answer gives into links to #t=<seconds>, outside code.
export const linkVideoTimes = (markdown: string) =>
  markdown.replace(CODE_OR_TIME, (match, time: string | undefined) => {
    const seconds = time === undefined ? null : parseVideoTime(time);
    return seconds === null ? match : `[${time}](#t=${seconds})`;
  });
