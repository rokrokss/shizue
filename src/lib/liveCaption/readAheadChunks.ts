import { createSegmenter } from '@/lib/liveCaption/segmenter';
import { createTranslationQueue, TranslationQueueOptions } from '@/lib/liveCaption/translationQueue';

// Captions read ahead of playback, split into chunks exactly like the captions on screen but in
// media time, so a chunk is known to be complete (and is sent to the LLM) before the viewer reaches
// its end. The controller then commits the on-screen chunk as soon as it matches, without waiting
// for the pause, and shows this translation instead of starting one. Twitch reads the broadcaster's
// CEA-608 from the player's buffered video (twitch/captionPrefetch); YouTube reads its live captions
// from the player's SABR responses (youtubeCaption/captionReadAhead).

// Chunks are matched by their words, not punctuation or case.
export const chunkKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const MAX_CHUNKS = 300;
// A chunk on screen matches only while playback is within this of the read chunk's speech: short
// chunks ("I", "Okay") come back, and a VOD reads half a minute ahead.
const MATCH_WINDOW_S = 1;

export type ReadAheadChunksOptions = {
  // The LLM path, or null when no model is set up (then only early commit is used).
  translate: TranslationQueueOptions['translate'] | null;
  onTranslation: (key: string, translation: string) => void;
  // A chunk just ended in what was read. On Twitch live streams the read-ahead is about as short as
  // the pause that ends a chunk, so the chunk on screen may already be complete by now.
  onChunk: () => void;
  // Where playback is, in media seconds.
  position: () => number | null;
  // See SegmenterOptions.blocks.
  blocks?: boolean;
};

// 'pending': its LLM translation is on the way. 'unavailable': there is none (no model, or the
// request failed), so the chunk on screen gets the usual translation.
export type PrefetchedChunk =
  | { status: 'pending' }
  | { status: 'done'; translation: string }
  | { status: 'unavailable' };

export function createReadAheadChunks(options: ReadAheadChunksOptions) {
  // The latest occurrence of each chunk's words, with its speech in media seconds.
  const chunks = new Map<string, PrefetchedChunk & { start: number; end: number }>();
  // The first chunk after a reset starts in the middle of a caption window, so it never matches.
  let warm = false;

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
      blocks: options.blocks,
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

  return {
    // The caption text the source shows from `seconds` of media time on.
    snapshot(text: string, seconds: number) {
      segmenter.push({ kind: 'snapshot', text, at: seconds * 1000 });
    },
    // Media time has reached `seconds`: a pause that long ends a chunk.
    tick(seconds: number) {
      segmenter.tick(seconds * 1000);
    },
    // The chunk on screen is one already read to its end, around this point.
    isComplete(text: string) {
      const known = chunks.get(chunkKey(text));
      const position = options.position();
      if (!known || position === null) return false;
      return known.start - MATCH_WINDOW_S <= position && position <= known.end + MATCH_WINDOW_S;
    },
    // What is known about the chunk on screen, if it was read ahead.
    chunk(text: string): PrefetchedChunk | undefined {
      return chunks.get(chunkKey(text));
    },
    // A seek or another page: what was read no longer continues. Translations stay unless `forget`.
    reset(forget: boolean) {
      segmenter = newSegmenter();
      warm = false;
      if (forget) {
        queue?.clear();
        chunks.clear();
      }
    },
    dispose() {
      queue?.clear();
      chunks.clear();
    },
  };
}
