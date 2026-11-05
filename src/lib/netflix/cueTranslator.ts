import type { Caption } from '@/lib/youtube';

// Translates a title's subtitle cues with the LLM in chunks, starting at the playback position and
// following it after a seek. It stays at most `lookaheadSeconds` ahead, even while paused, so
// stopping halfway through a film doesn't pay for the rest of it. Seeking to a line not translated
// yet drops the request under way and starts there.

export type CueTranslator = {
  // A cue's translation; undefined until it arrives, '' when its chunk failed.
  translation: (index: number) => string | undefined;
  setPosition: (time: number) => void;
  // Translates the whole track whatever the position, as a subtitle file needs.
  translateAll: () => void;
  // The share of the track's chunks done, from 0 to 1.
  progress: () => number;
  stop: () => void;
};

type Options = {
  cues: Caption[];
  // Resolves to one translation per cue, or null on failure. `start` is the first cue's index. A
  // translator that streams hands each line to `onLine` as it comes (its index within `cues`), and
  // may stop working once `signal` aborts.
  translate: (
    cues: Caption[],
    start: number,
    onLine: (index: number, text: string) => void,
    signal: AbortSignal
  ) => Promise<string[] | null>;
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
  let everything = false;
  let position = 0;
  let inFlight: { chunk: number; controller: AbortController } | null = null;

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

  const pending = (chunk: number) => !done[chunk] && attempts[chunk] < MAX_ATTEMPTS;

  const nextChunk = () => {
    const first = chunkAt(position);
    for (let chunk = first; chunk < chunkCount; chunk++) {
      if (!everything && cues[chunk * chunkSize].startTime > position + lookaheadSeconds) break;
      if (pending(chunk)) return chunk;
    }
    if (everything) {
      for (let chunk = 0; chunk < first; chunk++) if (pending(chunk)) return chunk;
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
        const controller = new AbortController();
        inFlight = { chunk, controller };
        const aborted = new Promise<null>((resolve) =>
          controller.signal.addEventListener('abort', () => resolve(null), { once: true })
        );
        const onLine = (index: number, text: string) => {
          if (controller.signal.aborted || stopped || done[chunk] || index < 0 || index >= part.length) return;
          translations[start + index] = text;
          onUpdate();
        };
        let result: string[] | null = null;
        try {
          result = await Promise.race([translate(part, start, onLine, controller.signal), aborted]);
        } catch {
          result = null;
        }
        inFlight = null;
        if (stopped) return;
        // Dropped for a seek: it may be asked again in full.
        if (controller.signal.aborted) {
          attempts[chunk]--;
          continue;
        }
        if (result && result.length === part.length) {
          result.forEach((text, i) => (translations[start + i] = text));
          done[chunk] = true;
        } else if (attempts[chunk] >= MAX_ATTEMPTS) {
          part.forEach((_, i) => (translations[start + i] ??= ''));
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
      const here = chunkAt(time);
      // A jump to lines still untranslated: what is being asked can wait.
      if (inFlight && here < chunkCount && inFlight.chunk !== here && pending(here)) {
        inFlight.controller.abort();
      }
      void pump();
    },
    translateAll: () => {
      everything = true;
      void pump();
    },
    progress: () => (chunkCount ? done.filter(Boolean).length / chunkCount : 1),
    stop: () => {
      stopped = true;
      inFlight?.controller.abort();
    },
  };
};
