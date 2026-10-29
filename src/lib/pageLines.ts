// A page summary's sections point back to the page: the page text the model reads has its longer
// lines numbered like [¶12], an answer gives the number where each part starts, and the side panel
// finds that line's text in the tab (lib/pageSeek.ts).

// Shorter lines (menus, buttons, headings) get no number: a section rarely starts there, and
// numbering them would cost tokens.
const MIN_LINE_CHARS = 40;
const NUMBERED_LINE = /^\[¶(\d+)\] (.*)$/gm;

export const numberPageLines = (text: string) => {
  let count = 0;
  return text
    .split('\n')
    .map((line) => (line.replace(/\s/g, '').length >= MIN_LINE_CHARS ? `[¶${++count}] ${line}` : line))
    .join('\n');
};

export const hasPageLines = (prompt: string) => /^\[¶1\] /m.test(prompt);

// A summary prompt's numbered lines, by number. The side panel asks on every render while an
// answer streams in, so the last few prompts' lines are kept.
const cache = new Map<string, Map<number, string>>();
const CACHE_SIZE = 4;

export const pageLines = (prompt: string) => {
  let lines = cache.get(prompt);
  if (!lines) {
    lines = new Map();
    for (const match of prompt.matchAll(NUMBERED_LINE)) lines.set(Number(match[1]), match[2]);
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(prompt, lines);
  }
  return lines;
};

const CODE_OR_LINE = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\[¶ ?(\d+)[^\]\n]{0,20}\](?!\()/g;

// Turns the [¶12] line numbers an answer gives into links to #p=<number>, outside code. A range
// like [¶12-15] points to its first line.
export const linkPageLines = (markdown: string) =>
  markdown.replace(CODE_OR_LINE, (match, line: string | undefined) =>
    line === undefined ? match : `[¶${line}](#p=${line})`
  );
