import { SUMMARY_PAGE_TEXT_MAX_CHARS } from '@/config/constants';
import type { PageAttachment } from '@/lib/indexDB';
import { readPdfText } from '@/lib/pdfText';

export type PageText = Omit<PageAttachment, 'truncated'>;

export type PageReadError = 'unreadable' | 'empty';

export type PageRead = { page: PageText } | { error: PageReadError };

// A page with less text than this (spaces aside) is a canvas app, a media page or an error page,
// and gives the model nothing to work with.
const MIN_PAGE_TEXT_CHARS = 200;

// Bigger PDFs are refused rather than loaded into memory.
const MAX_PDF_BYTES = 50 * 1024 * 1024;

const hasLittleText = (text: string) => text.replace(/\s/g, '').length < MIN_PAGE_TEXT_CHARS;

// Past the text one message carries a file is cut anyway; this keeps huge logs out of memory.
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

// Text, data and code files a model reads as they are. Browsers give many of these no MIME type.
const TEXT_FILE_EXTENSIONS = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini',
  'log', 'html', 'htm', 'css', 'scss', 'js', 'jsx', 'mjs', 'ts', 'tsx', 'py', 'ipynb', 'java',
  'kt', 'swift', 'go', 'rs', 'rb', 'php', 'c', 'h', 'cpp', 'hpp', 'cs', 'sh', 'sql', 'r', 'scala',
  'dart', 'lua', 'vue', 'svelte', 'tex', 'srt', 'vtt',
];

export const TEXT_FILE_ACCEPT = TEXT_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(',');

export const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export const isTextFile = (file: File) =>
  file.type.startsWith('text/') ||
  file.type === 'application/json' ||
  TEXT_FILE_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() ?? '');

// A short file is fine here, unlike a page: a few lines of code are worth asking about.
export const readTextFile = async (file: File): Promise<PageRead> => {
  if (file.size > MAX_TEXT_FILE_BYTES) return { error: 'unreadable' };
  try {
    const text = await file.text();
    // A NUL character means a binary file under a text name.
    if (text.includes('\u0000')) return { error: 'unreadable' };
    if (!text.trim()) return { error: 'empty' };
    return { page: { title: file.name, url: '', text, file: true } };
  } catch {
    return { error: 'unreadable' };
  }
};

// A PDF's text, up to the most one message carries. A scanned PDF has no text to read.
export const readPdfPage = async (data: ArrayBuffer, title: string, url: string): Promise<PageRead> => {
  if (data.byteLength > MAX_PDF_BYTES) return { error: 'unreadable' };
  try {
    const text = await readPdfText(data, SUMMARY_PAGE_TEXT_MAX_CHARS);
    return hasLittleText(text) ? { error: 'empty' } : { page: { title, url, text, pdf: true } };
  } catch {
    return { error: 'unreadable' };
  }
};

// Reads the tab's top frame as it is now, the same text a page summary reads. Restricted pages,
// sites the user withheld from Shizue and closed tabs fail as 'unreadable'.
export const readTabPage = async (tabId: number): Promise<PageRead> => {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        url: location.href,
        text: document.body?.innerText ?? '',
        pdf: document.contentType === 'application/pdf',
      }),
    });
    if (!injection?.result) return { error: 'unreadable' };
    const { pdf, ...page } = injection.result;
    if (pdf) {
      // Chrome's PDF viewer has no text in the page, so the PDF itself is fetched and read.
      const response = await fetch(page.url, { credentials: 'include' });
      if (!response.ok) return { error: 'unreadable' };
      return readPdfPage(await response.arrayBuffer(), page.title, page.url);
    }
    if (hasLittleText(page.text)) return { error: 'empty' };
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
