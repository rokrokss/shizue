import {
  chunkKey,
  createReadAheadChunks,
  PrefetchedChunk,
  ReadAheadChunksOptions,
} from '@/lib/liveCaption/readAheadChunks';
import { createCea608Decoder } from '@/lib/twitch/cea608';

// The broadcaster's captions read from video Twitch's player has buffered but not shown yet
// (twitch-player-worker.content), 1–3 s ahead on live streams and 10–35 s on VODs, and split into
// chunks ahead of the screen (lib/liveCaption/readAheadChunks).

export { chunkKey };
export type { PrefetchedChunk };

// Pairs outside this window around playback come from another player (Twitch keeps a second
// worker) or from before a seek.
const BEHIND_S = 5;
const AHEAD_S = 90;
// Pairs reach the page shortly after their video is appended, so the buffered end can run a
// little ahead of the captions read so far.
const BUFFERED_MARGIN_S = 0.3;

export type CaptionPrefetchOptions = ReadAheadChunksOptions;

export function createCaptionPrefetch(options: CaptionPrefetchOptions) {
  const chunks = createReadAheadChunks(options);
  // The newest frame read. A quality switch re-appends frames already read.
  let frontier = -Infinity;
  let framePts = -Infinity;
  const decoder = createCea608Decoder((pts, text) => chunks.snapshot(text.replace(/\r\n/g, ' '), pts));

  // A seek or a new channel: what was read no longer continues. Translations stay unless the
  // channel changed.
  function reset(forget: boolean) {
    decoder.reset();
    chunks.reset(forget);
    frontier = -Infinity;
    framePts = -Infinity;
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
          chunks.tick(pts);
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
      if (Number.isFinite(still)) chunks.tick(still);
    },
    isComplete: chunks.isComplete,
    chunk: chunks.chunk,
    reset,
    dispose: chunks.dispose,
  };
}

export type CaptionPrefetch = ReturnType<typeof createCaptionPrefetch>;
