import { CAPTION_LINE } from '@/lib/youtubeCaption/selectors';

// A YouTube live stream's captions, read from the screen: they come with the media (SABR), not as a
// caption track to download. YouTube only draws them while its captions are on.

// The lines on screen as one snapshot for the segmenter. CEA-608 marks a new speaker with ">>",
// which would be translated as text. YouTube's own live recognition ('asr') repeats a word where its
// cues meet ("premiums premiums soaring"), so an immediately repeated word is dropped there.
export const joinCaptionLines = (lines: string[], asr: boolean) => {
  const words = lines.join(' ').replace(/>>/g, ' ').split(/\s+/).filter(Boolean);
  const kept = asr
    ? words.filter((word, i) => i === 0 || word.toLowerCase() !== words[i - 1].toLowerCase())
    : words;
  return kept.join(' ');
};

export const readCaptionLines = (container: Element | null) =>
  [...(container?.querySelectorAll(CAPTION_LINE) ?? [])].map((line) => line.textContent ?? '');
