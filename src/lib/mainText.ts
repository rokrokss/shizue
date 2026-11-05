import { UI_SELECTOR } from '@/lib/siteRules';

// Left out of what a summary or an attached tab reads, besides page translation's menus and
// buttons (siteRules.ts): the site's header and footer, sidebars, search and dialogs such as
// cookie banners. An article's own header and footer hold its title, byline and notes, so they stay.
export const MAIN_TEXT_EXCLUDE = [
  UI_SELECTOR,
  'header:not(article header)',
  'footer:not(article footer)',
  'aside:not(article aside)',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
].join(', ');

// The page as a summary or an attached tab reads it: the text of its main content, without the
// menus, sidebars and links to other pages around it. The main content is the page's <main>, or
// the one article in it holding two thirds of its text (a blog post, a news story, not a feed).
// The parts left out are hidden only while the text is read, within one task, so nothing on
// screen changes. A page with too little text this way (a canvas app, an odd layout) gives all its
// text, as before. Runs in the page on its own (chrome.scripting.executeScript), so it uses
// nothing outside itself.
export function readPageContent(exclude: string) {
  const page = {
    title: document.title,
    url: window.location.href,
    pdf: document.contentType === 'application/pdf',
  };
  const body = document.body;
  if (!body) return { ...page, text: '' };
  const MIN_CHARS = 200;
  const visible = (element: Element) => element.checkVisibility?.() ?? true;
  const chars = (element: HTMLElement) => element.innerText.replace(/\s/g, '').length;

  // Hidden by writing the attribute: one Chrome changed through element.style keeps an empty
  // style="" after removeAttribute.
  const hidden = Array.from(body.querySelectorAll<HTMLElement>(exclude));
  const styles = hidden.map((element) => element.getAttribute('style'));
  hidden.forEach((element, i) => element.setAttribute('style', `${styles[i] ?? ''};display:none !important`));
  let text: string;
  try {
    let root: HTMLElement = body;
    const main = Array.from(document.querySelectorAll<HTMLElement>('main, [role="main"]')).find(visible);
    if (main && chars(main) >= MIN_CHARS) root = main;
    const total = chars(root);
    let article: HTMLElement | null = null;
    let articleChars = 0;
    for (const candidate of Array.from(root.querySelectorAll<HTMLElement>('article'))) {
      if (candidate.parentElement?.closest('article') || !visible(candidate)) continue;
      const count = chars(candidate);
      if (count > articleChars) [article, articleChars] = [candidate, count];
    }
    if (article && articleChars >= MIN_CHARS && articleChars * 3 >= total * 2) root = article;
    text = root.innerText;
  } finally {
    hidden.forEach((element, i) => {
      const style = styles[i];
      if (style === null) element.removeAttribute('style');
      else element.setAttribute('style', style);
    });
  }
  if (text.replace(/\s/g, '').length < MIN_CHARS) text = body.innerText;
  return { ...page, text };
}
