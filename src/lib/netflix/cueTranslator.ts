import type { Caption } from '@/lib/youtube';

// Translates a title's subtitle cues with the LLM in chunks, as the YouTube captions do, starting at
// the playback position and following it after a seek. It stays at most `lookaheadSeconds` ahead,
// so stopping halfway through a film doesn't pay for the rest of it.

export type CueTranslator = {
  // A cue's translation; undefined until its chunk is done, '' when the chunk failed.
  translation: (index: number) => string | undefined;
  setPosition: (time: number) => void;
  stop: () => void;
};

type Options = {
  cues: Caption[];
  // Resolves to one translation per cue, or null on failure. `start` is the first cue's index.
  translate: (cues: Caption[], start: number) => Promise<string[] | null>;
  onUpdate: () => void;
  chunkSize?: number;
  lookaheadSeconds?: number;
};

const CHUNK_SIZE = 10;
const LOOKAHEAD_SECONDS = 600;
// A chunk that failed is tried once more; after that its cues show the original.
const MAX_ATTEMPTS = 2;

export const createCueTranslator = ({
  cues,
  translate,
  onUpdate,
  chunkSize = CHUNK_SIZE,
  lookaheadSeconds = LOOKAHEAD_SECONDS,
}: Options): CueTranslator => {
  const translations: (string | undefined)[] = new Array(cues.length).fill(undefined);
  const chunkCount = Math.ceil(cues.length / chunkSize);
  const attempts = new Array(chunkCount).fill(0);
  const done = new Array(chunkCount).fill(false);
  let running = false;
  let stopped = false;
  let position = 0;

  // The chunk holding the cue on screen, or the next one after a gap.
  const chunkAt = (time: number) => {
    let lo = 0;
    let hi = cues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].endTime <= time) lo = mid + 1;
      else hi = mid;
    }
    return Math.floor(lo / chunkSize);
  };

  const nextChunk = () => {
    for (let chunk = chunkAt(position); chunk < chunkCount; chunk++) {
      if (cues[chunk * chunkSize].startTime > position + lookaheadSeconds) return null;
      if (!done[chunk] && attempts[chunk] < MAX_ATTEMPTS) return chunk;
    }
    return null;
  };

  const pump = async () => {
    if (running) return;
    running = true;
    try {
      for (let chunk = nextChunk(); chunk !== null && !stopped; chunk = nextChunk()) {
        attempts[chunk]++;
        const start = chunk * chunkSize;
        const part = cues.slice(start, start + chunkSize);
        let result: string[] | null = null;
        try {
          result = await translate(part, start);
        } catch {
          result = null;
        }
        if (stopped) return;
        if (result && result.length === part.length) {
          result.forEach((text, i) => (translations[start + i] = text));
          done[chunk] = true;
        } else if (attempts[chunk] >= MAX_ATTEMPTS) {
          part.forEach((_, i) => (translations[start + i] = ''));
          done[chunk] = true;
        }
        onUpdate();
      }
    } finally {
      running = false;
    }
  };

  return {
    translation: (index) => translations[index],
    setPosition: (time) => {
      position = time;
      void pump();
    },
    stop: () => {
      stopped = true;
    },
  };
};
