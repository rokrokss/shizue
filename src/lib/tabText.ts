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

// Pages attached together share `budget` characters equally.
export const toPageAttachments = (pages: PageText[], budget: number): PageAttachment[] => {
  const limit = Math.floor(budget / pages.length);
  return pages.map((page) =>
    page.text.length > limit ? { ...page, text: page.text.slice(0, limit), truncated: true } : page
  );
};
