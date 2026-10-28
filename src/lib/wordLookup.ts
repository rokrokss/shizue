import type { SavedWord } from '@/lib/indexDB';
import { videoTimeUrl, youtubeVideoId } from '@/lib/videoTranscript';

// Looking up a word of the original captions while watching, and the word list it can be saved to.

// What the translation model says about a word in one caption line, in the target language.
export interface WordMeaning {
  // The word's dictionary form, in the original language.
  lemma: string;
  // How a Japanese or Chinese word is read (kana, pinyin); empty for other languages.
  reading: string;
  partOfSpeech: string;
  // What it means in that line.
  meaning: string;
  // How it is used there, if worth saying; may be empty.
  note: string;
}

const WORD_MEANING_KEYS = ['lemma', 'reading', 'partOfSpeech', 'meaning', 'note'] as const;

export const WORD_MEANING_JSON_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(WORD_MEANING_KEYS.map((key) => [key, { type: 'string' }])),
  required: [...WORD_MEANING_KEYS],
};

// The model's JSON object, or null without a meaning. Some models wrap JSON in a code fence.
export const parseWordMeaning = (raw: string): WordMeaning | null => {
  const fenced = raw.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced ? fenced[1] : raw.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const fields = parsed as Record<string, unknown>;
  const meaning = Object.fromEntries(
    WORD_MEANING_KEYS.map((key) => [
      key,
      typeof fields[key] === 'string' ? (fields[key] as string).trim() : '',
    ])
  ) as unknown as WordMeaning;
  return meaning.meaning ? meaning : null;
};

export interface CaptionPiece {
  text: string;
  // A word to look up, not spaces or punctuation.
  word: boolean;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

// A caption line split into words and what lies between them. Japanese and Chinese, written
// without spaces, are split by the browser's dictionary.
export const captionPieces = (line: string): CaptionPiece[] =>
  [...segmenter.segment(line)].map((segment) => ({
    text: segment.segment,
    word: !!segment.isWordLike,
  }));

// Where a saved word came from: the video at `seconds` when the site's links can start there, else
// the page. Live streams pass null.
export const sourceLink = (url: string, seconds: number | null) => {
  const videoId = youtubeVideoId(url);
  const time = seconds === null ? null : Math.max(0, Math.floor(seconds));
  if (videoId) return time === null ? `https://www.youtube.com/watch?v=${videoId}` : videoTimeUrl(videoId, time);
  if (time === null) return url;
  const { hostname, origin, pathname } = new URL(url);
  if (/(^|\.)netflix\.com$/.test(hostname) && pathname.startsWith('/watch/')) {
    return `${origin}${pathname}?t=${time}`;
  }
  if (/(^|\.)twitch\.tv$/.test(hostname) && pathname.startsWith('/videos/')) {
    const h = Math.floor(time / 3600);
    const m = Math.floor((time % 3600) / 60);
    return `${origin}${pathname}?t=${h}h${m}m${time % 60}s`;
  }
  return url;
};

// YYYY-MM-DD in the viewer's time zone.
export const localDate = (time: number) => {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const csvField = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

// The word list as CSV for a spreadsheet or Anki's import: a header row, then one word per row.
// The byte order mark makes Excel read it as UTF-8.
export const wordListCsv = (words: SavedWord[]) => {
  const header = ['word', 'reading', 'meaning', 'part of speech', 'note', 'sentence', 'sentence translation', 'source', 'link', 'saved'];
  const rows = words.map((word) => [
    word.lemma || word.word,
    word.reading,
    word.meaning,
    word.partOfSpeech,
    word.note,
    word.sentence,
    word.sentenceTranslation,
    word.sourceTitle,
    word.sourceUrl,
    localDate(word.createdAt),
  ]);
  return '﻿' + [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
};
