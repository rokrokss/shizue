// A source reports what it currently shows (a CEA-608 roll-up window, the text in the Stream Closed
// Captioner frame, or a speech recognizer's finals + interim). The segmenter works out what is new.
export type SourceUpdate =
  | { kind: 'snapshot'; text: string; at: number }
  // The next snapshot does not continue the previous one: the source switched, the viewer seeked,
  // the caption box went away or an ad started.
  | { kind: 'break'; at: number };

export type Sentence = {
  id: string;
  text: string;
  startedAt: number;
  committedAt: number;
  // When its words last changed: the end of speech, while committedAt may come after a pause.
  endedAt?: number;
};

export type TranslationContext = { source: string; translation: string };
