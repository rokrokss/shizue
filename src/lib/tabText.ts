import type { PageAttachment } from '@/lib/indexDB';

export type PageText = Omit<PageAttachment, 'truncated'>;

export type PageReadError = 'unreadable' | 'empty';

// A page with less text than this (spaces aside) is a canvas app, a media page or an error page,
// and gives the model nothing to work with.
const MIN_PAGE_TEXT_CHARS = 200;

// Reads the tab's top frame as it is now, the same text a page summary reads. Restricted pages,
// sites the user withheld from Shizue and closed tabs fail as 'unreadable'.
export const readTabPage = async (
  tabId: number
): Promise<{ page: PageText } | { error: PageReadError }> => {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        url: location.href,
        text: document.body?.innerText ?? '',
      }),
    });
    const page = injection?.result;
    if (!page) return { error: 'unreadable' };
    if (page.text.replace(/\s/g, '').length < MIN_PAGE_TEXT_CHARS) return { error: 'empty' };
    return { page };
  } catch {
    return { error: 'unreadable' };
  }
};

// Shares `budget` characters among texts of these lengths: shorter ones keep all their text, and
// what they leave goes to the longer ones.
export const splitTextBudget = (lengths: number[], budget: number): number[] => {
  const limits = new Array<number>(lengths.length);
  let left = budget;
  lengths
    .map((length, index) => ({ length, index }))
    .sort((a, b) => a.length - b.length)
    .forEach(({ length, index }, i, sorted) => {
      limits[index] = Math.min(length, Math.floor(left / (sorted.length - i)));
      left -= limits[index];
    });
  return limits;
};

export const toPageAttachments = (pages: PageText[], budget: number): PageAttachment[] => {
  const limits = splitTextBudget(
    pages.map((page) => page.text.length),
    budget
  );
  return pages.map((page, i) =>
    page.text.length > limits[i]
      ? { ...page, text: page.text.slice(0, limits[i]), truncated: true }
      : page
  );
};
