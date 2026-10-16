import { createSegmenter } from '@/lib/liveCaption/segmenter';
import { createTranslationQueue, TranslationQueueOptions } from '@/lib/liveCaption/translationQueue';
import { createCea608Decoder } from '@/lib/twitch/cea608';

// The broadcaster's captions read from video Twitch's player has buffered but not shown yet
// (twitch-player-worker.content), 1–3 s ahead on live streams and 10–35 s on VODs. They are split
// into chunks exactly like the captions on screen, but in media time, so a chunk is known to be
// complete (and is sent to the LLM) before the viewer reaches its end. The controller then commits
// the on-screen chunk as soon as it matches, without waiting for the pause, and shows this
// translation instead of starting one.

// Chunks are matched by their words, not punctuation or case.
export const chunkKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Pairs outside this window around playback come from another player (Twitch keeps a second
// worker) or from before a seek.
const BEHIND_S = 5;
const AHEAD_S = 90;
const MAX_CHUNKS = 300;
// Pairs reach the page shortly after their video is appended, so the buffered end can run a
// little ahead of the captions read so far.
const BUFFERED_MARGIN_S = 0.3;

export type CaptionPrefetchOptions = {
  // The LLM path, or null when no model is set up (then only early commit is used).
  translate: TranslationQueueOptions['translate'] | null;
  onTranslation: (key: string, translation: string) => void;
  // A chunk just ended in the buffered captions. On live streams the read-ahead is about as short
  // as the pause that ends a chunk, so the chunk on screen may already be complete by now.
  onChunk: () => void;
  // Where playback is, in media seconds.
  position: () => number | null;
};

// 'pending': its LLM translation is on the way. 'unavailable': there is none (no model, or the
// request failed), so the chunk on screen gets the usual translation.
export type PrefetchedChunk =
  | { status: 'pending' }
  | { status: 'done'; translation: string }
  | { status: 'unavailable' };

// A chunk on screen matches only while playback is within this of the buffered chunk's speech:
// short chunks ("I", "Okay") come back, and a VOD reads half a minute ahead.
const MATCH_WINDOW_S = 1;

export function createCaptionPrefetch(options: CaptionPrefetchOptions) {
  // The latest occurrence of each chunk's words, with its speech in media seconds.
  const chunks = new Map<string, PrefetchedChunk & { start: number; end: number }>();
  // The first chunk after a reset starts in the middle of a caption window, so it never matches.
  let warm = false;
  // The newest frame read. A quality switch re-appends frames already read.
  let frontier = -Infinity;
  let framePts = -Infinity;

  const queue = options.translate
    ? createTranslationQueue({
        // Stamped with wall time when enqueued; a burst of VOD chunks can wait a while.
        now: () => Date.now(),
        staleMs: 60_000,
        translate: options.translate,
        onResult: (key, translation) => {
          const known = chunks.get(key);
          if (!known) return;
          const { start, end } = known;
          chunks.set(key, translation ? { status: 'done', translation, start, end } : { status: 'unavailable', start, end });
          if (translation) options.onTranslation(key, translation);
        },
      })
    : null;

  const newSegmenter = () =>
    createSegmenter({
      onSentence: (sentence) => {
        const key = chunkKey(sentence.text);
        if (!warm) {
          warm = true;
          return;
        }
        const start = sentence.startedAt / 1000;
        const end = (sentence.endedAt ?? sentence.committedAt) / 1000;
        const known = key ? chunks.get(key) : undefined;
        if (!key) return;
        if (known) {
          chunks.set(key, { ...known, start, end });
        } else {
          chunks.set(key, { ...(queue ? { status: 'pending' } : { status: 'unavailable' }), start, end });
          if (chunks.size > MAX_CHUNKS) chunks.delete(chunks.keys().next().value!);
          queue?.enqueue({ ...sentence, id: key, committedAt: Date.now() });
        }
        options.onChunk();
      },
    });
  let segmenter = newSegmenter();
  const decoder = createCea608Decoder((pts, text) =>
    segmenter.push({ kind: 'snapshot', text: text.replace(/\r\n/g, ' '), at: pts * 1000 })
  );

  // A seek or a new channel: what was read no longer continues. Translations stay unless the
  // channel changed.
  function reset(forget: boolean) {
    decoder.reset();
    segmenter = newSegmenter();
    frontier = -Infinity;
    framePts = -Infinity;
    warm = false;
    if (forget) {
      queue?.clear();
      chunks.clear();
    }
  }

  return {
    // CEA-608 pairs [presentation time s, byte 1, byte 2] from the worker, while playback is at
    // `position` seconds.
    add(pairs: number[][], position: number) {
      // Playback far behind what was read: a seek the bridge didn't report.
      if (position + AHEAD_S < frontier) reset(false);
      const before = frontier;
      for (const [pts, b1, b2] of pairs) {
        if (pts <= before || pts < position - BEHIND_S || pts > position + AHEAD_S) continue;
        if (pts !== framePts) {
          // Media time passes between caption frames, which is how a pause ends a chunk.
          decoder.flush();
          segmenter.tick(pts * 1000);
          framePts = pts;
        }
        decoder.push(pts, b1, b2);
        frontier = Math.max(frontier, pts);
      }
      decoder.flush();
    },
    // The player has buffered video up to `end` seconds. Silent video carries no captions, so this
    // is how a pause at the end of what was read becomes known.
    advance(end: number) {
      const still = Math.max(frontier, end - BUFFERED_MARGIN_S);
      if (Number.isFinite(still)) segmenter.tick(still * 1000);
    },
    // The chunk on screen is one the buffered captions already ended, around this point.
    isComplete(text: string) {
      const known = chunks.get(chunkKey(text));
      const position = options.position();
      if (!known || position === null) return false;
      return known.start - MATCH_WINDOW_S <= position && position <= known.end + MATCH_WINDOW_S;
    },
    // What is known about the chunk on screen, if the buffered captions had it.
    chunk(text: string): PrefetchedChunk | undefined {
      return chunks.get(chunkKey(text));
    },
    reset,
    dispose() {
      queue?.clear();
      chunks.clear();
    },
  };
}

export type CaptionPrefetch = ReturnType<typeof createCaptionPrefetch>;
