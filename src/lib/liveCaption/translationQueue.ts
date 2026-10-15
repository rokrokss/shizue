import type { Sentence, TranslationContext } from '@/lib/liveCaption/types';

export type TranslationQueueOptions = {
  // Returns one translation per text, or null when the request failed.
  translate: (texts: string[], context: TranslationContext[]) => Promise<string[] | null>;
  // A null translation means the sentence was dropped or its request failed.
  onResult: (id: string, translation: string | null) => void;
  now: () => number;
  maxBatch?: number;
  concurrency?: number;
  // A sentence still waiting this long after it was committed has scrolled off screen.
  staleMs?: number;
  contextSize?: number;
};

// Sends committed sentences out in small batches, with the last few translated sentences as
// context, and drops sentences that waited so long the viewer has already moved on.
export function createTranslationQueue(options: TranslationQueueOptions) {
  const maxBatch = options.maxBatch ?? 3;
  const concurrency = options.concurrency ?? 2;
  const staleMs = options.staleMs ?? 15_000;
  const contextSize = options.contextSize ?? 3;

  let waiting: Sentence[] = [];
  let context: TranslationContext[] = [];
  let active = 0;
  let generation = 0;

  const pump = () => {
    while (active < concurrency && waiting.length) {
      const now = options.now();
      const fresh = waiting.filter((sentence) => now - sentence.committedAt <= staleMs);
      for (const sentence of waiting) {
        if (!fresh.includes(sentence)) options.onResult(sentence.id, null);
      }
      waiting = fresh;
      if (!waiting.length) return;

      const batch = waiting.splice(0, maxBatch);
      const requestGeneration = generation;
      active++;
      options
        .translate(
          batch.map((sentence) => sentence.text),
          context.slice(-contextSize)
        )
        .catch(() => null)
        .then((translations) => {
          if (requestGeneration !== generation) return;
          const ok = translations && translations.length === batch.length;
          batch.forEach((sentence, index) => {
            const translation = ok ? translations[index] : null;
            if (translation) {
              context = [...context, { source: sentence.text, translation }].slice(-contextSize);
            }
            options.onResult(sentence.id, translation);
          });
        })
        .finally(() => {
          if (requestGeneration !== generation) return;
          active--;
          pump();
        });
    }
  };

  return {
    enqueue(sentence: Sentence) {
      waiting.push(sentence);
      pump();
    },
    // Forgets queued sentences and ignores answers still in flight (channel switch, seek).
    clear() {
      generation++;
      waiting = [];
      context = [];
      active = 0;
    },
  };
}

export type TranslationQueue = ReturnType<typeof createTranslationQueue>;
