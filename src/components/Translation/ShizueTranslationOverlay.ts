import { TEXT_ELEMENTS } from '@/lib/html';
import DOMPurify from 'dompurify';

// Translations are LLM output derived from page content, so a prompt injection on the page could
// return active HTML. Keep only inline formatting before inserting it into the page.
const TRANSLATION_ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'del', 'dfn', 'em', 'i', 'ins', 'kbd',
  'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time',
  'u', 'var', 'wbr',
];
const TRANSLATION_ALLOWED_ATTR = ['href', 'title', 'lang', 'dir'];

const sanitizeTranslation = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TRANSLATION_ALLOWED_TAGS,
    ALLOWED_ATTR: TRANSLATION_ALLOWED_ATTR,
  });

const TAG_NAME = 'shizue-translation-overlay';
const overlays = new WeakMap<Element, ShizueTranslationOverlay>();

// The translation shown under a page element: a plain element with this object holding its state,
// not a custom element. Content scripts have no customElements, and in Firefox the polyfill left
// the elements without their methods, so page translation stopped at the first one.
export class ShizueTranslationOverlay {
  private translatedText = '';
  private isLoading = true;
  private hasError = false;

  private constructor(readonly element: HTMLElement) {}

  static attach(parent: Element): ShizueTranslationOverlay {
    const overlay = new ShizueTranslationOverlay(document.createElement(TAG_NAME));
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
    this.element.remove();
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
  }

  // Public methods for external control
  setTexts(translatedText: string) {
    this.translatedText = translatedText;
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
