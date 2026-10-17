import type { Caption } from '@/lib/youtube';

// Netflix serves text subtitles as TTML (dfxp-ls-sdh, simplesdh, imsc1.1) or WebVTT
// (webvtt-lssdh-ios8). Both become cues in seconds, sorted, with cues that share a time range
// merged and each cue ending no later than the next one starts, so one cue at most is on screen.
// String parsing instead of DOMParser keeps this runnable in tests and in any context.

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lrm: '',
  rlm: '',
};

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });

// Collapses whitespace inside each line and drops direction marks and empty lines.
const cleanLines = (text: string) =>
  text
    .replace(/[‎‏‪-‮]/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

const attribute = (attributes: string, name: string) =>
  attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`))?.[1] ??
  attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*'([^']*)'`))?.[1] ??
  null;

type TimeBase = { tickRate: number; frameRate: number };

// TTML time expressions: clock time (00:01:02.500 or 00:01:02:12 in frames) or an offset with a
// unit (12345678t in ticks, 1.5s, 300ms, 2m, 1h, 30f).
const parseTtmlTime = (value: string | null, base: TimeBase): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const offset = trimmed.match(/^(\d+(?:\.\d+)?)(h|ms|m|s|f|t)$/);
  if (offset) {
    const amount = parseFloat(offset[1]);
    switch (offset[2]) {
      case 'h':
        return amount * 3600;
      case 'm':
        return amount * 60;
      case 's':
        return amount;
      case 'ms':
        return amount / 1000;
      case 'f':
        return amount / base.frameRate;
      case 't':
        return amount / base.tickRate;
    }
  }
  const clock = trimmed.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?$/);
  if (clock) {
    const frames = clock[4] ? parseFloat(clock[4]) / base.frameRate : 0;
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + parseFloat(clock[3]) + frames;
  }
  return null;
};

export const parseTtml = (xml: string): Caption[] => {
  const root = xml.match(/<(?:\w+:)?tt\b([^>]*)>/)?.[1] ?? '';
  const frameRateValue = parseFloat(attribute(root, 'ttp:frameRate') ?? '') || 30;
  const multiplier = (attribute(root, 'ttp:frameRateMultiplier') ?? '1 1').split(/\s+/).map(Number);
  const frameRate =
    multiplier.length === 2 && multiplier[0] > 0 && multiplier[1] > 0
      ? (frameRateValue * multiplier[0]) / multiplier[1]
      : frameRateValue;
  const tickRate = parseFloat(attribute(root, 'ttp:tickRate') ?? '') || frameRate;
  const base = { tickRate, frameRate };

  const cues: Caption[] = [];
  for (const match of xml.matchAll(/<(?:\w+:)?p\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?p>/g)) {
    const [, attributes, body] = match;
    const startTime = parseTtmlTime(attribute(attributes, 'begin'), base);
    if (startTime === null) continue;
    const end = parseTtmlTime(attribute(attributes, 'end'), base);
    const duration = parseTtmlTime(attribute(attributes, 'dur'), base);
    const endTime = end ?? (duration !== null ? startTime + duration : null);
    if (endTime === null || endTime <= startTime) continue;
    const text = cleanLines(
      decodeEntities(
        body
          // Ruby readings (furigana) and their fallback parentheses would run into the base text.
          .replace(/<(?:\w+:)?span\b[^>]*tts:ruby\s*=\s*"(?:text|delimiter)"[^>]*>[\s\S]*?<\/(?:\w+:)?span>/g, '')
          .replace(/\s*\n\s*/g, ' ')
          .replace(/<(?:\w+:)?br\b[^>]*\/?>/g, '\n')
          .replace(/<[^>]+>/g, '')
      )
    );
    if (text) cues.push({ startTime, endTime, text });
  }
  return normalizeCues(cues);
};

const parseVttTime = (value: string): number | null => {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, '0')) / 1000
  );
};

export const parseWebVtt = (vtt: string): Caption[] => {
  const cues: Caption[] = [];
  for (const block of vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;
    const [from, rest] = lines[timingIndex].split('-->');
    const startTime = parseVttTime(from);
    const endTime = parseVttTime(rest.trim().split(/\s+/)[0] ?? '');
    if (startTime === null || endTime === null || endTime <= startTime) continue;
    const text = cleanLines(
      decodeEntities(
        lines
          .slice(timingIndex + 1)
          .join('\n')
          .replace(/<rt>[\s\S]*?<\/rt>/g, '')
          .replace(/<[^>]+>/g, '')
      )
    );
    if (text) cues.push({ startTime, endTime, text });
  }
  return normalizeCues(cues);
};

export const parseSubtitles = (text: string): Caption[] =>
  /^﻿?WEBVTT/.test(text.trimStart()) ? parseWebVtt(text) : parseTtml(text);

// Sorted by start; cues sharing a time range (a sign and a line placed apart) become one cue, and
// a cue ends when the next one starts.
export const normalizeCues = (cues: Caption[]): Caption[] => {
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  const merged: Caption[] = [];
  for (const cue of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.startTime - cue.startTime) < 0.01 && Math.abs(last.endTime - cue.endTime) < 0.01) {
      if (last.text !== cue.text) last.text = `${last.text}\n${cue.text}`;
      continue;
    }
    merged.push({ ...cue });
  }
  for (let i = 0; i < merged.length - 1; i++) {
    merged[i].endTime = Math.min(merged[i].endTime, merged[i + 1].startTime);
  }
  return merged.filter((cue) => cue.endTime > cue.startTime);
};

// Official subtitles in two languages usually share a timing template, but not always line for
// line. A target cue is shown with every original cue it substantially overlaps (half of the
// shorter one), so a line that spans two original lines shows under both, else with the one it
// overlaps most. A target cue that overlaps no original line (a sign translated only in the target
// track) becomes a line of its own, with no original text.
export const alignCues = (originals: Caption[], targets: Caption[]): { cues: Caption[]; translations: string[] } => {
  const duration = (cue: Caption) => cue.endTime - cue.startTime;
  const assigned: string[][] = originals.map(() => []);
  const orphans: Caption[] = [];
  let first = 0;
  for (const target of targets) {
    while (first < originals.length && originals[first].endTime <= target.startTime) first++;
    const overlapping: { index: number; overlap: number }[] = [];
    for (let i = first; i < originals.length && originals[i].startTime < target.endTime; i++) {
      const overlap = Math.min(originals[i].endTime, target.endTime) - Math.max(originals[i].startTime, target.startTime);
      if (overlap > 0) overlapping.push({ index: i, overlap });
    }
    if (!overlapping.length) {
      orphans.push(target);
      continue;
    }
    const substantial = overlapping.filter(
      ({ index, overlap }) => overlap >= 0.5 * Math.min(duration(originals[index]), duration(target))
    );
    const chosen = substantial.length ? substantial : [overlapping.reduce((a, b) => (b.overlap > a.overlap ? b : a))];
    for (const { index } of chosen) assigned[index].push(target.text);
  }
  const lines = [
    ...originals.map((cue, i) => ({ cue, translation: assigned[i].join('\n') })),
    ...orphans.map((cue) => ({ cue: { ...cue, text: '' }, translation: cue.text })),
  ].sort((a, b) => a.cue.startTime - b.cue.startTime);
  return { cues: lines.map((line) => line.cue), translations: lines.map((line) => line.translation) };
};

// The cue on screen at `time` (cues don't overlap after normalizeCues), or -1.
export const findCueIndex = (cues: Caption[], time: number): number => {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (time < cues[mid].startTime) hi = mid - 1;
    else if (time >= cues[mid].endTime) lo = mid + 1;
    else return mid;
  }
  return -1;
};
