// Models write TeX as $…$, $$…$$, \(…\) or \[…\]; remark-math reads only the dollar forms.
// Code spans and blocks are left alone, and a dollar before a digit ($5, $10) is a price.

const PLACEHOLDER = (index: number) => `\u0000${index}\u0000`;

// Worth loading KaTeX for: some delimited TeX outside code.
export const hasMath = (text: string) =>
  /\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$[^\s$\d][^$\n]*\$/.test(stripCode(text));

const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;

const stripCode = (text: string) => text.replace(CODE, '');

export const prepareMath = (text: string) => {
  const kept: string[] = [];
  const keep = (value: string) => PLACEHOLDER(kept.push(value) - 1);

  let result = text
    .replace(CODE, keep)
    // \[…\] and a $$…$$ alone on its line are display math: remark-math wants the $$ on lines
    // of their own for that.
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => keep(`\n$$\n${tex.trim()}\n$$\n`))
    .replace(/^[ \t]*\$\$([^\n]+?)\$\$[ \t]*$/gm, (_, tex: string) => keep(`$$\n${tex.trim()}\n$$`))
    .replace(/\$\$[\s\S]+?\$\$/g, keep)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => keep(`$${tex.trim()}$`))
    .replace(/(?<!\\)\$(?=\d)/g, '\\$');

  // Restored in reverse, since a kept piece can hold an earlier placeholder.
  for (let index = kept.length - 1; index >= 0; index--) {
    result = result.replace(PLACEHOLDER(index), () => kept[index]);
  }
  return result;
};
