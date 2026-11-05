// Caption translations come back as one line per caption, its number, a tab and its translation,
// so each shows as soon as its line arrives instead of after the whole answer, and a line the model
// skipped or merged is known by its number.

// "3\tText", and the forms models drift into: "3. Text", "3: Text", "3) Text", "[3] Text".
const NUMBERED = /^\s*\[?(\d{1,3})\]?(?:\t|[.:)|-]?[ \t]+|[.:)|-](?=\S|$))(.*)$/;

// Reads a streamed answer for `count` lines; `onLine` gets each line's index (from 0) and text the
// first time it comes. Anything else (a code fence, a note, a number out of range) is skipped.
export const createNumberedLineReader = (count: number, onLine: (index: number, text: string) => void) => {
  const lines: (string | undefined)[] = new Array(count).fill(undefined);
  let buffer = '';

  const read = (line: string) => {
    const match = line.match(NUMBERED);
    if (!match) return;
    const index = Number(match[1]) - 1;
    if (index < 0 || index >= count || lines[index] !== undefined) return;
    lines[index] = match[2].trim();
    onLine(index, lines[index]!);
  };

  return {
    push: (text: string) => {
      buffer += text;
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      parts.forEach(read);
    },
    // The last line has no newline after it. Lines never given stay undefined.
    end: () => {
      read(buffer);
      buffer = '';
      return lines;
    },
  };
};

// The lines as the model reads them: one per line, numbered from 1. A caption's own line breaks
// become spaces, since each answer line is one caption.
export const numberLines = (lines: string[]) =>
  lines.map((line, index) => `${index + 1}\t${line.replace(/\s*\n\s*/g, ' ')}`).join('\n');
