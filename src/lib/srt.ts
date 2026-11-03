import type { Caption } from '@/lib/youtube';

const timestamp = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

// SubRip: numbered cues with their times, a blank line after each. A blank line inside a cue
// would end it, so a cue's lines close up.
export const toSrt = (captions: Caption[]) =>
  captions
    .map((caption) => ({ ...caption, text: caption.text.trim().replace(/\s*\n\s*/g, '\n') }))
    .filter((caption) => caption.text)
    .map(
      (caption, index) =>
        `${index + 1}\n${timestamp(caption.startTime)} --> ${timestamp(Math.max(caption.startTime, caption.endTime))}\n${caption.text}\n`
    )
    .join('\n');

// A file name from the video's title, without the characters file systems refuse.
export const srtFileName = (title: string, label: string) => {
  const name = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${name || 'captions'}.${label}.srt`;
};
