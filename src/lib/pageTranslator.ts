import {
  ShizueTranslationOverlay,
  registerShizueTranslationOverlay,
} from '@/components/Translation/ShizueTranslationOverlay';
import { debugLog, errorLog } from '@/logs';
import { translationService } from '@/services/translationService';

export class PageTranslator {
  private isActive: boolean = false;
  private observer: MutationObserver | null = null;
  private translatedElements: Set<Element> = new Set();
  private scrollTimeout: NodeJS.Timeout | null = null;
  private lastScrollTime: number = 0;

  constructor() {
    // Check if web component is registered
    registerShizueTranslationOverlay();
    this.setupMutationObserver();
  }

  // Set up MutationObserver
  private setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isActive) return;

      let hasNewContent = false;

      mutations.forEach((mutation) => {
        // Check if new nodes are added
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            hasNewContent = true;
          }
        });

        // Detect text changes
        if (
          mutation.type === 'characterData' ||
          (mutation.type === 'childList' && mutation.target.nodeType === Node.ELEMENT_NODE)
        ) {
          hasNewContent = true;
        }
      });

      if (hasNewContent) {
        // For debouncing, add a slight delay
        // FIXME: The debouncing is not working properly. When a new element is added during translation, the request is repeated.
        // setTimeout(() => this.translateVisibleElements(), 500);
      }
    });
  }

  // Toggle translation activation/deactivation
  public toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  // Activate translation
  private activate() {
    this.isActive = true;
    this.startObserving();
    this.translateVisibleElements();
    debugLog('Page translation activated');
  }

  // Deactivate translation
  private deactivate() {
    this.isActive = false;
    this.stopObserving();
    this.removeAllTranslations();
    debugLog('Page translation deactivated');
  }

  // Start observing DOM
  private startObserving() {
    if (this.observer) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: false,
      });
    }

    // Add scroll event listener
    this.addScrollListener();
  }

  // Stop observing DOM
  private stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Remove scroll event listener
    this.removeScrollListener();
  }

  // Add scroll event listener
  private addScrollListener() {
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    debugLog('Scroll event listener added');
  }

  // Remove scroll event listener
  private removeScrollListener() {
    window.removeEventListener('scroll', this.handleScroll);
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    debugLog('Scroll event listener removed');
  }

  // Scroll event handler (with debouncing)
  private handleScroll = () => {
    if (!this.isActive) return;

    const now = Date.now();
    this.lastScrollTime = now;

    // Clear existing timer
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // 300ms debouncing
    this.scrollTimeout = setTimeout(() => {
      // Check if 300ms has passed since the last scroll event
      if (Date.now() - this.lastScrollTime >= 300) {
        debugLog('Scroll completed - start translating new elements');
        this.translateVisibleElements();
      }
    }, 300);
  };

  // Remove all translations
  private removeAllTranslations() {
    this.translatedElements.forEach((element) => {
      const overlay = element.querySelector('shizue-translation-overlay') as Element;
      if (overlay) {
        element.removeChild(overlay);
      }
    });
    this.translatedElements.clear();
  }

  // Translate visible elements
  private async translateVisibleElements() {
    if (!this.isActive) return;
    try {
      const elements = this.findTranslatableElements();

      debugLog(`Found ${elements.length} elements to translate`);

      for (const element of elements) {
        if (this.translatedElements.has(element)) continue;
        this.translatedElements.add(element);
        const text = element.innerHTML?.trim();
        if (!text) continue;

        // Create overlay with spinner first
        const overlay = this.attachTranslationOverlay(element);
        overlay.setLoading(true);

        try {
          // Request translation
          const translatedTextResult = await translationService.translateHtmlText(text);

          if (translatedTextResult.success && translatedTextResult.translatedText) {
            overlay.setTexts(element, translatedTextResult.translatedText);
          } else {
            // Show error state and remove overlay after translation fails
            overlay.setError(true);
            errorLog('Translation error:', translatedTextResult.error);

            // Remove overlay after 3 seconds
            setTimeout(() => {
              if (element.contains(overlay)) {
                element.removeChild(overlay);
                this.translatedElements.delete(element);
              }
            }, 3000);
          }
        } catch (error) {
          // Show error state and remove overlay after translation fails
          overlay.setError(true);
          errorLog('Translation error:', error);

          // Remove overlay after 3 seconds
          setTimeout(() => {
            try {
              if (element.contains(overlay)) {
                element.removeChild(overlay);
                this.translatedElements.delete(element);
              }
            } catch (removeError) {
              debugLog('Error removing overlay:', removeError);
            }
          }, 3000);
        }

        // Prevent API call rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      errorLog('Error translating elements:', error);
    }
  }

  // Find translatable elements
  private findTranslatableElements(): Element[] {
    const elements: Element[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const element = node as Element;

        if (!this.isElementVisible(element)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (this.isTranslatableElement(element)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_SKIP;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      elements.push(node as Element);
    }

    return elements;
  }

  // Check if element is visible
  private isElementVisible(element: Element): boolean {
    try {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
    } catch {
      return false;
    }
  }

  // Check if element is translatable
  private isTranslatableElement(element: Element): boolean {
    const text = element.textContent?.trim();

    if (!text || text.length === 0 || text.length > 2000) {
      return false;
    }

    // Check if actual text is included
    if (!/[a-zA-Z가-힣]/.test(text)) {
      return false;
    }

    // Check if element is already translated
    if (
      element.querySelector('shizue-translation-overlay') !== null ||
      element.tagName === 'SHIZUE-TRANSLATION-OVERLAY'
    ) {
      return false;
    }

    // Check if element is a text-related element or a leaf node
    const textElements = [
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
    if (textElements.includes(element.tagName)) {
      return false;
    }
    if (
      Array.from(element.getElementsByTagName('*')).some(
        (child) => child !== element && this.isTranslatableElement(child)
      )
    ) {
      return false;
    }
    return true;
  }

  private attachTranslationOverlay(element: Element): ShizueTranslationOverlay {
    const overlay = document.createElement(
      'shizue-translation-overlay'
    ) as ShizueTranslationOverlay;
    element.appendChild(overlay);
    return overlay;
  }

  // Return current active state
  public isTranslationActive(): boolean {
    return this.isActive;
  }

  // Clean up resources
  public destroy() {
    this.deactivate();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clean up scroll-related resources
    this.removeScrollListener();

    debugLog('PageTranslator resources cleaned up');
  }
}

// Global instance
let globalPageTranslator: PageTranslator | null = null;

// Get global PageTranslator instance
export const getPageTranslator = (): PageTranslator => {
  if (!globalPageTranslator) {
    globalPageTranslator = new PageTranslator();
  }
  return globalPageTranslator;
};
