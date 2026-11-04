import { createSegmenter, Segmenter } from '@/lib/liveCaption/segmenter';

// A meeting's captions as lines to translate. Only the newest turn grows; the sites go on
// correcting older ones a little, which are left as they were read. A new turn commits what the
// last one left pending. Each turn's text is a growing paragraph, cut into sentences by the live
// caption segmenter (at its punctuation, a pause, or a caption line's length).

export type TranscriptBlock = { key: unknown; speaker: string; text: string };

export type TranscriptLine = { id: string; speaker: string; text: string };

export type TranscriptOptions = {
  onLine: (line: TranscriptLine) => void;
  // The words of the newest turn not yet in a line ('' once they are).
  onInterim: (speaker: string, text: string) => void;
  pauseMs?: number;
};

export const createMeetingTranscript = ({ onLine, onInterim, pauseMs = 1200 }: TranscriptOptions) => {
  let key: unknown = undefined;
  let segmenter: Segmenter | null = null;
  let sequence = 0;
  let current = { speaker: '' };

  const startTurn = (block: TranscriptBlock, at: number) => {
    segmenter?.push({ kind: 'break', at });
    key = block.key;
    // The turn's lines read its speaker when they are cut: Meet fills the name in late.
    const turn = { speaker: block.speaker };
    current = turn;
    segmenter = createSegmenter({
      pauseMs,
      onInterim: (text) => onInterim(turn.speaker, text),
      onSentence: (sentence) => onLine({ id: `m${++sequence}`, speaker: turn.speaker, text: sentence.text }),
    });
  };

  return {
    // The caption blocks on screen now, oldest first.
    update: (blocks: TranscriptBlock[], at: number) => {
      const newest = blocks[blocks.length - 1];
      if (!newest) return;
      if (newest.key !== key || !segmenter) startTurn(newest, at);
      if (newest.speaker) current.speaker = newest.speaker;
      segmenter!.push({ kind: 'snapshot', text: newest.text, at });
    },
    tick: (at: number) => segmenter?.tick(at),
    // The captions went away (turned off, or the meeting ended): commit what is pending.
    flush: (at: number) => {
      segmenter?.push({ kind: 'break', at });
      segmenter = null;
      key = undefined;
    },
  };
};

export type MeetingTranscript = ReturnType<typeof createMeetingTranscript>;
