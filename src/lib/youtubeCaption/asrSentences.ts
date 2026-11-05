import { textWidth, tokenize } from '@/lib/liveCaption/segmenter';

// YouTube's speech recognition captions come as two-line windows that roll a word at a time, cut
// mid-sentence, and older tracks have no punctuation. Translating them window by window gives
// fragments, so the words are put back together into sentences using their own timings: a
// sentence ends at its punctuation, at a change of speaker or a long pause, and one that runs on
// is cut where the speaker paused longest.

export type AsrSegment = { utf8?: string; tOffsetMs?: number };
export type AsrEvent = { tStartMs: number; dDurationMs?: number; aAppend?: number; segs?: AsrSegment[] };
// `words`: where each word starts in `text` and when it is said (s), for showing the word spoken.
export type AsrSentence = {
  startTime: number;
  endTime: number;
  text: string;
  words: { offset: number; time: number }[];
};

type Word = { text: string; start: number; end: number };

const SENTENCE_END = /[.?!…。？！]["'”’)\]」』]*$/u;
const SOFT_BREAK = /[,;:、，；：]["'”’)\]」』]*$/u;
// "Mr. Smith", "e.g. this", "J. K. Rowling": a period that doesn't end the sentence.
const ABBREVIATION = /(?:^|\s)(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|e\.g|i\.e)\.$/i;
const INITIAL = /(?:^|\s)[A-Z]\.$/;
const SPEAKER_CHANGE = /^\s*>>\s*/;
// Japanese and Chinese words follow each other without spaces.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
// "[Music]", "[Applause]": a sound, shown on its own.
const SOUND_TAG = /^\[[^\]]*\]$/;

// About two caption lines wide (Japanese, Chinese and Korean characters count as two columns), and
// a few seconds long.
const MAX_WIDTH = 84;
const MAX_DURATION_MS = 8000;
// Where a sentence may end is chosen at the lowest cost: each sentence costs `sentenceCost`, one
// narrower than MIN_WIDTH more, and ending after a pause or a comma pays back. Silence of
// `hardPauseMs` always ends a sentence.
type Rules = { sentenceCost: number; commaValue: number; hardPauseMs: number };
// Without punctuation, the speaker's pauses are all there is to go by.
const UNPUNCTUATED: Rules = { sentenceCost: 600, commaValue: 300, hardPauseMs: 2500 };
// With it, a speaker who stops mid-sentence ("let's make our stone ... pick.") is still in it: a
// sentence is cut only when too long, at a comma if it has one.
const PUNCTUATED: Rules = { sentenceCost: 2500, commaValue: 1500, hardPauseMs: 5000 };
// A track ending a sentence at least once in this many words has punctuation.
const PUNCTUATED_WORDS = 40;
const MIN_WIDTH = 30;
const SHORT_COST = 2;
const MAX_PAUSE_VALUE = 2000;
// The last word stays this long at most, and the sentence a moment after it to be read.
const MAX_WORD_MS = 2000;
const LINGER_MS = 1000;

// Columns on screen, with the space before the word.
const width = (word: Word) => textWidth(tokenize(word.text)) + (/^\s/.test(word.text) ? 1 : 0);

// The words' text with single spaces, and where each word starts in it.
const joinWords = (words: Word[]) => {
  let text = '';
  const marks: AsrSentence['words'] = [];
  for (const word of words) {
    let piece = word.text.replace(/\s+/g, ' ');
    // A space never leads the text nor doubles up.
    if (!text || text.endsWith(' ')) piece = piece.trimStart();
    if (!piece) continue;
    marks.push({ offset: text.length + (piece.startsWith(' ') ? 1 : 0), time: word.start / 1000 });
    text += piece;
  }
  return { text: text.trimEnd(), words: marks };
};

const endsSentence = (text: string) =>
  SENTENCE_END.test(text) && !ABBREVIATION.test(text.trim()) && !INITIAL.test(text.trim());

// Every recognized word with its start, in order. Appended line breaks carry no words.
export const asrWords = (events: AsrEvent[]): Word[] => {
  const words: Word[] = [];
  for (const event of events) {
    const eventEnd = event.tStartMs + (event.dDurationMs ?? 0);
    for (const seg of event.segs ?? []) {
      const text = (seg.utf8 ?? '').replace(/\n/g, ' ');
      if (!text.trim()) continue;
      const start = event.tStartMs + (seg.tOffsetMs ?? 0);
      // A line's first word has no space before it, even where the language uses them.
      const previous = words[words.length - 1]?.text ?? ' ';
      const spaced = /^[\p{L}\p{N}]/u.test(text) && !/\s$/.test(previous)
        && !UNSPACED.test(text[0]) && !UNSPACED.test(previous[previous.length - 1]);
      words.push({ text: spaced ? ` ${text}` : text, start, end: eventEnd });
    }
  }
  words.sort((a, b) => a.start - b.start);
  words.forEach((word, index) => {
    const next = words[index + 1]?.start ?? Infinity;
    word.end = Math.min(next, word.end > word.start ? word.end : Infinity, word.start + MAX_WORD_MS);
  });
  return words;
};

// Cuts a run of words with no sure break into sentences that fit, where the speaker paused.
const splitSpan = (span: Word[], rules: Rules): Word[][] => {
  const breakValue = (word: Word, next: Word) =>
    Math.min(MAX_PAUSE_VALUE, next.start - word.start) +
    (SOFT_BREAK.test(word.text) ? rules.commaValue : 0);
  // cost[end]: the cheapest way to cut the words before end; from[end]: where its last sentence starts.
  const cost = [0];
  const from = [0];
  for (let end = 1; end <= span.length; end++) {
    cost[end] = Infinity;
    const ending = end < span.length ? breakValue(span[end - 1], span[end]) : 0;
    let columns = 0;
    for (let start = end - 1; start >= 0; start--) {
      columns += width(span[start]);
      const fits = columns <= MAX_WIDTH && span[end - 1].start - span[start].start <= MAX_DURATION_MS;
      if (!fits && start < end - 1) break;
      const short = Math.max(0, MIN_WIDTH - columns);
      const total = cost[start] + rules.sentenceCost + short * short * SHORT_COST - ending;
      if (total < cost[end]) {
        cost[end] = total;
        from[end] = start;
      }
    }
  }
  const sentences: Word[][] = [];
  for (let end = span.length; end > 0; end = from[end]) sentences.unshift(span.slice(from[end], end));
  return sentences;
};

export const groupAsrSentences = (events: AsrEvent[]): AsrSentence[] => {
  const words = asrWords(events);
  const ends = words.filter((word) => endsSentence(word.text)).length;
  const rules = ends * PUNCTUATED_WORDS >= words.length ? PUNCTUATED : UNPUNCTUATED;
  // Runs of words between the breaks that are sure: punctuation, a change of speaker, a sound and a
  // long silence.
  const spans: Word[][] = [];
  let span: Word[] = [];
  const close = () => {
    if (span.length) spans.push(span);
    span = [];
  };
  for (const word of words) {
    const speakerChange = SPEAKER_CHANGE.test(word.text);
    if (speakerChange) word.text = word.text.replace(SPEAKER_CHANGE, ' ');
    const sound = SOUND_TAG.test(word.text.trim());
    const previous = span[span.length - 1];
    if (previous && (speakerChange || sound || word.start - previous.start >= rules.hardPauseMs)) close();
    if (!word.text.trim()) continue;
    span.push(word);
    if (sound || endsSentence(word.text)) close();
  }
  close();

  const groups = spans.flatMap((run) => splitSpan(run, rules));
  return groups.map((group, index) => {
    const start = group[0].start;
    const next = groups[index + 1]?.[0].start ?? Infinity;
    const end = Math.min(next, group[group.length - 1].end + LINGER_MS);
    return { startTime: start / 1000, endTime: end / 1000, ...joinWords(group) };
  });
};
