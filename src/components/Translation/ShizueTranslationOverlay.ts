import { STORAGE_PAGE_TRANSLATION_MODE } from '@/config/constants';
import type { Language } from '@/hooks/language';
import { restorePlaceholders, TEXT_ELEMENTS } from '@/lib/html';
import { translationAttributes } from '@/lib/language';
import DOMPurify from 'dompurify';

// Translations are LLM output derived from page content, so a prompt injection on the page could
// return active HTML. Keep only inline formatting, and the paragraphs of an element a site rule
// translates whole (lib/siteRules.ts), before inserting it into the page.
const TRANSLATION_ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'del', 'dfn', 'em', 'i', 'ins', 'kbd',
  'mark', 'p', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup',
  'time', 'u', 'var', 'wbr',
];
const TRANSLATION_ALLOWED_ATTR = ['href', 'title', 'lang', 'dir'];

const sanitizeTranslation = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TRANSLATION_ALLOWED_TAGS,
    ALLOWED_ATTR: TRANSLATION_ALLOWED_ATTR,
  });

const TAG_NAME = 'shizue-translation-overlay';
const overlays = new WeakMap<Element, ShizueTranslationOverlay>();

// "Translation only" hides the original with CSS and never removes it: the page element gets this
// attribute, which shrinks its own text to nothing and hides its other children. The one style
// element is unlayered, so it can't reorder the page's cascade layers.
const TRANSLATION_ONLY_ATTR = 'data-shizue-translation-only';
const TRANSLATION_ONLY_STYLE_ID = 'shizue-translation-only-style';
const TRANSLATION_ONLY_CSS = `
[${TRANSLATION_ONLY_ATTR}] { font-size: 0 !important; }
[${TRANSLATION_ONLY_ATTR}]::marker { font-size: 1rem; }
[${TRANSLATION_ONLY_ATTR}] > :not(${TAG_NAME}) { display: none !important; }
[${TRANSLATION_ONLY_ATTR}] > ${TAG_NAME} {
  font-size: var(--shizue-font-size) !important;
  line-height: var(--shizue-line-height) !important;
  opacity: 1 !important;
}
`;

let translationOnly = false;
let modeWatched = false;

// The words on a translation that failed, in the reader's language (PageTranslator sets them).
export type TranslationLabels = { failed: string; retry: string };
let labels: TranslationLabels = { failed: 'Not translated', retry: 'Try again' };
export const setTranslationLabels = (next: TranslationLabels | undefined) => {
  if (next) labels = next;
};

// The translation-only rules go into each tree holding a translation: shadow roots don't see the
// document's styles.
const styledRoots = new WeakSet<Node>();
const ensureTranslationOnlyStyle = (host: Element) => {
  const root = host.getRootNode();
  if (styledRoots.has(root)) return;
  styledRoots.add(root);
  const sheet = document.createElement('style');
  sheet.id = TRANSLATION_ONLY_STYLE_ID;
  sheet.textContent = TRANSLATION_ONLY_CSS;
  if (root instanceof ShadowRoot) root.appendChild(sheet);
  else if (!document.getElementById(TRANSLATION_ONLY_STYLE_ID)) {
    (document.head ?? document.documentElement).appendChild(sheet);
  }
};

const WARNING_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.2v.3"/></svg>';
const RETRY_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
const ERROR_STYLE = `
  .shizue-failed {
    display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 2px 0; font-size: 12px; line-height: 18px; font-style: normal; font-weight: normal;
    letter-spacing: normal; text-transform: none; text-decoration: none;
  }
  .shizue-failed-text { display: inline-flex; align-items: center; gap: 4px; opacity: 0.6; }
  .shizue-retry {
    all: unset; display: inline-flex; align-items: center; gap: 3px; cursor: pointer;
    color: #1fa898; font-size: 12px; line-height: 18px; border-radius: 4px; padding: 0 2px;
  }
  .shizue-retry:hover { text-decoration: underline; text-underline-offset: 2px; }
  .shizue-retry:focus-visible { outline: 2px solid #32CCBC; outline-offset: 1px; }
  @media (prefers-color-scheme: dark) { .shizue-retry { color: #32CCBC; } }
`;

const setTranslationOnly = (mode: unknown) => {
  const next = mode === 'translationOnly';
  if (next === translationOnly) return;
  translationOnly = next;
  document.querySelectorAll(TAG_NAME).forEach((element) => overlays.get(element)?.applyMode());
};

// Every frame reads the setting itself, and a change applies to translations already on the page.
const watchMode = () => {
  if (modeWatched) return;
  modeWatched = true;
  void chrome.storage.local
    .get(STORAGE_PAGE_TRANSLATION_MODE)
    .then((stored) => setTranslationOnly(stored[STORAGE_PAGE_TRANSLATION_MODE]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STORAGE_PAGE_TRANSLATION_MODE in changes) {
      setTranslationOnly(changes[STORAGE_PAGE_TRANSLATION_MODE].newValue);
    }
  });
};

// The translation shown under a page element: a plain element with this object holding its state,
// not a custom element. Content scripts have no customElements, and in Firefox the polyfill left
// the elements without their methods, so page translation stopped at the first one.
export class ShizueTranslationOverlay {
  private translatedText = '';
  private isLoading = true;
  private hasError = false;
  // The elements the translation's {{n}} placeholders stand for, and whether all came back.
  private atoms: Node[] = [];
  private atomsRestored = true;
  private onRetry: (() => void) | null = null;
  // The page element hidden behind this translation.
  private hiddenHost: Element | null = null;

  private constructor(readonly element: HTMLElement) {}

  // The page element's original shows again (the page took the translation away).
  static showOriginal(host: Element) {
    host.removeAttribute(TRANSLATION_ONLY_ATTR);
  }

  static attach(parent: Element, language: Language | null): ShizueTranslationOverlay {
    watchMode();
    const overlay = new ShizueTranslationOverlay(document.createElement(TAG_NAME));
    if (language) Object.assign(overlay.element, translationAttributes(language));
    overlays.set(overlay.element, overlay);
    parent.appendChild(overlay.element);
    overlay.render();
    return overlay;
  }

  // The overlay attached directly under the element, if any.
  static find(parent: Element): ShizueTranslationOverlay | undefined {
    const element = Array.from(parent.children).find((child) => overlays.has(child));
    return element && overlays.get(element);
  }

  remove() {
    this.hide(false);
    this.element.remove();
  }

  // Shows the translation alone when that is the mode and it is complete; otherwise both.
  applyMode() {
    this.hide(
      translationOnly &&
        !this.isLoading &&
        !this.hasError &&
        this.translatedText.trim() !== '' &&
        this.atomsRestored
    );
  }

  private hide(on: boolean) {
    const el = this.element;
    const host = on ? el.parentElement : this.hiddenHost;
    if (!host) return;
    if (on && !this.hiddenHost) {
      // Read before the host's own text shrinks to nothing.
      const style = window.getComputedStyle(host);
      el.style.setProperty('--shizue-font-size', style.fontSize);
      el.style.setProperty('--shizue-line-height', style.lineHeight);
      ensureTranslationOnlyStyle(host);
      host.setAttribute(TRANSLATION_ONLY_ATTR, '');
      this.hiddenHost = host;
    } else if (!on && this.hiddenHost) {
      ShizueTranslationOverlay.showOriginal(host);
      this.hiddenHost = null;
    }
  }

  private render() {
    const el = this.element;
    el.style.visibility = 'visible';
    const parentElement = el.parentElement;
    if (!parentElement) return;
    if (
      TEXT_ELEMENTS.includes(parentElement.tagName) &&
      window.getComputedStyle(parentElement).display === 'inline'
    ) {
      el.style.display = 'inline-block';
    } else {
      el.style.display = 'block';
    }
    el.style.transition = 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out';
    el.style.boxSizing = 'border-box';

    el.style.overflow = 'hidden'; // for max-height transition
    el.style.maxHeight = '0px';

    if (this.isLoading) {
      el.style.maxHeight = '0px';
      setTimeout(() => {
        el.style.opacity = '1';
      }, 0);
      el.innerHTML = `
        <style>
          .shizue-spinner-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 18px;
            padding: 1px 0;
          }
          .shizue-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #32CCBC;
            border-radius: 50%;
            animation: shizue-spin 0.8s linear infinite;
          }
          
          @keyframes shizue-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
        </style>
        <div class="shizue-spinner-wrapper"><div class="shizue-spinner"></div></div>
      `;
      el.style.lineHeight = 'normal';
      // Under an inherited `white-space: pre-wrap` the template's line breaks render as a blank
      // line that pushes the spinner out of the 20px box (e.g. cerebras.ai blog paragraphs).
      el.style.whiteSpace = 'normal';
      setTimeout(() => {
        el.style.maxHeight = '20px';
      }, 0);
    } else if (this.hasError) {
      this.renderError();
    } else {
      el.style.maxHeight = '20px';
      el.innerHTML = sanitizeTranslation(this.translatedText);
      this.atomsRestored = restorePlaceholders(el, this.atoms);
      el.style.lineHeight = '';
      el.style.whiteSpace = '';
      el.style.opacity = '0.5';

      const targetHeight = el.scrollHeight + 'px';
      if (el.style.maxHeight !== targetHeight) {
        setTimeout(() => {
          el.style.maxHeight = targetHeight;
        }, 0);
        setTimeout(() => {
          el.style.opacity = '0.5';
        }, 0);
        setTimeout(() => {
          el.style.overflow = 'visible';
          el.style.maxHeight = 'none';
        }, 400);
      }
    }
    this.applyMode();
  }

  // A small note where the translation would be, with a button that tries again. It stays until
  // the reader retries or translation stops. Clicks don't reach the page: the paragraph may be a link.
  private renderError() {
    const el = this.element;
    el.innerHTML = `<style>${ERROR_STYLE}</style>`;
    const note = document.createElement('span');
    note.className = 'shizue-failed';
    const text = document.createElement('span');
    text.className = 'shizue-failed-text';
    text.innerHTML = WARNING_ICON;
    text.append(labels.failed);
    note.append(text);
    if (this.onRetry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'shizue-retry';
      retry.innerHTML = RETRY_ICON;
      retry.append(labels.retry);
      const stop = (e: Event) => e.stopPropagation();
      retry.addEventListener('pointerdown', stop);
      retry.addEventListener('mousedown', stop);
      retry.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onRetry?.();
      });
      note.append(retry);
    }
    el.append(note);
    el.style.lineHeight = 'normal';
    el.style.whiteSpace = 'normal';
    el.style.opacity = '1';
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';
  }

  // Public methods for external control
  setTexts(translatedText: string, atoms: Node[] = []) {
    this.translatedText = translatedText;
    this.atoms = atoms;
    this.isLoading = false;
    this.hasError = false;
    this.render();
  }

  setLoading(loading: boolean) {
    this.isLoading = loading;
    if (loading) {
      this.hasError = false;
    }
    this.render();
  }

  setError(hasError: boolean, onRetry: (() => void) | null = null) {
    this.hasError = hasError;
    this.onRetry = onRetry;
    if (hasError) {
      this.isLoading = false;
    }
    this.render();
  }

  getLoading(): boolean {
    return this.isLoading;
  }

  getError(): boolean {
    return this.hasError;
  }
}
