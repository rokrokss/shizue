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
  private atoms: Element[] = [];
  private atomsRestored = true;
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
      if (!document.getElementById(TRANSLATION_ONLY_STYLE_ID)) {
        const sheet = document.createElement('style');
        sheet.id = TRANSLATION_ONLY_STYLE_ID;
        sheet.textContent = TRANSLATION_ONLY_CSS;
        (document.head ?? document.documentElement).appendChild(sheet);
      }
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

  // Public methods for external control
  setTexts(translatedText: string, atoms: Element[] = []) {
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

  setError(hasError: boolean) {
    this.hasError = hasError;
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
