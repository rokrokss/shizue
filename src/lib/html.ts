export const TEXT_ELEMENTS = [
  'SPAN',
  'STRONG',
  'EM',
  'A',
  'B',
  'I',
  'U',
  'MARK',
  'SMALL',
  'SUB',
  'SUP',
  'CODE',
];

// Code, formulas and icons are never translated. Inside a paragraph that is, each one goes to the
// LLM as a {{n}} placeholder and comes back as it was (KaTeX, MathJax, GitHub's math-renderer,
// Wikipedia's and arXiv's math, code editors).
export const PRESERVED_SELECTOR = [
  'pre',
  'code',
  'kbd',
  'samp',
  'svg',
  'math',
  '.katex',
  'mjx-container',
  '.MathJax',
  '.MathJax_Display',
  '.MathJax_Preview',
  '.MathJax_SVG',
  '.MathJax_CHTML',
  'math-renderer',
  '.mwe-math-element',
  '.ltx_Math',
  '.ltx_equation',
  '.ltx_equationgroup',
  '.CodeMirror',
  '.monaco-editor',
].join(', ');

// Left out of the text sent for translation.
const DROPPED_SELECTOR = 'script, style, noscript, template';

export const PLACEHOLDER_RE = /\{\{\s*(\d+)\s*\}\}/;

// The element's text that would be translated: everything but preserved and dropped elements.
export const translatableText = (element: Element): string => {
  let text = '';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeType === Node.TEXT_NODE
        ? NodeFilter.FILTER_ACCEPT
        : (node as Element).matches(`${PRESERVED_SELECTOR}, ${DROPPED_SELECTOR}`)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP,
  });
  while (walker.nextNode()) text += walker.currentNode.textContent;
  return text;
};

// The element's HTML to translate, with each preserved element replaced by {{n}}, and those
// elements (detached copies) in placeholder order.
export const translationSource = (element: Element): { html: string; atoms: Element[] } => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(DROPPED_SELECTOR).forEach((node) => node.remove());
  const atoms: Element[] = [];
  for (const node of Array.from(clone.querySelectorAll(PRESERVED_SELECTOR))) {
    // Inside one already replaced.
    if (!clone.contains(node)) continue;
    node.replaceWith(`{{${atoms.length}}}`);
    atoms.push(node);
  }
  return { html: clone.innerHTML.trim(), atoms };
};

// Puts copies of the preserved elements where the translation has their placeholders. False when
// the translation lost one of them.
export const restorePlaceholders = (root: Element, atoms: Element[]): boolean => {
  if (atoms.length === 0) return true;
  const used = new Set<number>();
  const texts: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    const parts = text.data.split(new RegExp(PLACEHOLDER_RE.source, 'g'));
    if (parts.length === 1) continue;
    text.replaceWith(
      ...parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const atom = atoms[Number(part)];
        if (!atom) return `{{${part}}}`;
        used.add(Number(part));
        return atom.cloneNode(true);
      })
    );
  }
  return used.size === atoms.length;
};
