import type { ReadAhead } from '@/lib/liveCaption/liveCaptionController';
import { chunkKey, createReadAheadChunks, ReadAheadChunksOptions } from '@/lib/liveCaption/readAheadChunks';
import { joinCaptionLines } from '@/lib/youtubeCaption/domCaptionSource';

// A YouTube live stream's captions read from the player's SABR responses (youtube-player-hook.content)
// 12–21 s before they show, split into chunks ahead of the screen (lib/liveCaption/readAheadChunks).
// Each cue is a block of lines as the screen shows it, so it is fed as one snapshot, cleaned the same
// way as the screen's.

export type LiveCaptionReadAheadOptions = ReadAheadChunksOptions & {
  // YouTube's live recognition: drop immediately repeated words, as the screen reader does.
  asr: boolean;
};

export function createLiveCaptionReadAhead(options: LiveCaptionReadAheadOptions) {
  const chunks = createReadAheadChunks({ ...options, blocks: options.asr });
  // The newest cue read; segments can come again.
  let frontier = -Infinity;
  let last: { text: string; end: number } | null = null;

  const readAhead: ReadAhead = {
    isComplete: chunks.isComplete,
    chunk: chunks.chunk,
    key: chunkKey,
    // Media time only moves when the next segment arrives.
    tick: () => {},
    reset: (navigation) => {
      chunks.reset(navigation);
      frontier = -Infinity;
      last = null;
    },
    dispose: chunks.dispose,
  };

  return {
    readAhead,
    // Cues [start s, end s, text] from one segment.
    add(cues: [number, number, string][]) {
      for (const [start, end, raw] of [...cues].sort((a, b) => a[0] - b[0])) {
        if (start <= frontier) continue;
        frontier = start;
        const text = joinCaptionLines([raw], options.asr);
        if (!text) continue;
        // A block that runs across a segment boundary comes in both segments.
        if (last && text === last.text && start - last.end < 1) {
          last.end = end;
          continue;
        }
        chunks.tick(start);
        chunks.snapshot(text, start);
        last = { text, end };
      }
    },
  };
}
