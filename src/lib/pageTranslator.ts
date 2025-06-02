import {
  ShizueTranslationOverlay,
  registerShizueTranslationOverlay,
} from '@/components/Translation/ShizueTranslationOverlay';
import { debugLog, errorLog } from '@/logs';
import { translationService } from '@/services/translationService';

export class PageTranslator {
  private isActive: boolean = false;
  private observer: MutationObserver | null = null;
  private scrollTimeout: NodeJS.Timeout | null = null;
  private lastScrollTime: number = 0;
  private readonly MAX_CHARS_PER_API_REQUEST = 1000;

  // properties for robust queueing
  private translationQueue: { elements: Element[]; texts: string[] }[] = [];
  private isProcessingBatch: boolean = false;
  private queuedElements: Set<Element> = new Set();

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

  private abortCurrentBatch() {
    this.isProcessingBatch = false;
    // TODO: abort controller to stop llm call in background
  }

  // Deactivate translation
  private deactivate() {
    this.isActive = false;
    this.stopObserving();
    this.abortCurrentBatch();
    this.removeAllTranslations();
    this.translationQueue = [];
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
    this.queuedElements.forEach((element) => {
      const overlay = element.querySelector('shizue-translation-overlay') as Element;
      if (overlay) {
        element.removeChild(overlay);
      }
    });
    this.queuedElements.clear();
  }

  private removeOverlayFromElement(
    element: Element,
    overlay: ShizueTranslationOverlay,
    removeTranslatedElement: boolean = true
  ) {
    if (element.contains(overlay)) {
      element.removeChild(overlay);
      if (removeTranslatedElement) {
        if (this.queuedElements.has(element)) {
          this.queuedElements.delete(element);
        }
      }
    }
  }

  private createTranslationBatches(
    elements: Element[]
  ): { elements: Element[]; texts: string[] }[] {
    debugLog(
      `Found ${elements.length} new elements for potential translation. Creating batches...`
    );

    const batches: {
      elements: Element[];
      texts: string[];
    }[] = [];

    let currentBatchElements: Element[] = [];
    let currentBatchTexts: string[] = [];
    let currentBatchCharCount = 0;

    for (const element of elements) {
      const text = element.innerHTML?.trim();
      const textLength = text.length;

      if (textLength >= this.MAX_CHARS_PER_API_REQUEST) {
        // batch with a single element
        if (currentBatchElements.length > 0) {
          // if there is a batch being created, complete it first
          batches.push({
            elements: currentBatchElements,
            texts: currentBatchTexts,
          });
        }
        batches.push({ elements: [element], texts: [text] });

        currentBatchElements = [];
        currentBatchTexts = [];
        currentBatchCharCount = 0;
      } else {
        // add current element to existing batch or start a new batch
        if (
          currentBatchCharCount + textLength > this.MAX_CHARS_PER_API_REQUEST &&
          currentBatchElements.length > 0
        ) {
          // complete and start a new batch
          batches.push({
            elements: currentBatchElements,
            texts: currentBatchTexts,
          });
          currentBatchElements = [element];
          currentBatchTexts = [text];
          currentBatchCharCount = textLength;
        } else {
          // push to existing batch
          currentBatchElements.push(element);
          currentBatchTexts.push(text);
          currentBatchCharCount += textLength;
        }
      }
    }

    // leftovers
    if (currentBatchElements.length > 0) {
      batches.push({
        elements: currentBatchElements,
        texts: currentBatchTexts,
      });
    }

    return batches;
  }

  private async processTranslationQueue() {
    if (this.isProcessingBatch || this.translationQueue.length === 0 || !this.isActive) {
      return;
    }

    this.isProcessingBatch = true;
    const batchToProcess = this.translationQueue.shift();

    if (!batchToProcess || batchToProcess.elements.length === 0) {
      this.isProcessingBatch = false;
      if (this.isActive) this.processTranslationQueue(); // process next batch
      return;
    }

    debugLog(
      `Processing a batch of ${batchToProcess.elements.length} element(s). Remaining batches: ${this.translationQueue.length}`
    );

    const { elements, texts } = batchToProcess;

    const overlaysInBatch: { element: Element; overlay: ShizueTranslationOverlay }[] = [];
    elements.forEach((element) => {
      if (
        this.queuedElements.has(element) &&
        !element.querySelector('shizue-translation-overlay')
      ) {
        const overlay = this.attachTranslationOverlay(element);
        overlay.setLoading(true);
        overlaysInBatch.push({ element, overlay });
      } else {
        // overlay exists unexpectedly
        if (this.queuedElements.has(element)) {
          this.queuedElements.delete(element);
        }
      }
    });

    const validElementsForApi = overlaysInBatch.map((o) => o.element);
    const validTextsForApi = texts.filter(
      (_, index) => elements.indexOf(validElementsForApi[index]) !== -1
    );

    if (validElementsForApi.length === 0) {
      this.isProcessingBatch = false;
      if (this.isActive) this.processTranslationQueue();
      return;
    }

    try {
      const translatedTextResult = await translationService.translateHtmlTextBatch(
        validTextsForApi
      );

      if (!this.isActive) {
        debugLog(
          `Translation batch processing was deactivated for batch with ${elements.length} elements.`
        );
        overlaysInBatch.forEach(({ element: el, overlay: ov }) => {
          if (el.contains(ov)) {
            this.removeOverlayFromElement(el, ov, true);
          } else if (this.queuedElements.has(el)) {
            this.queuedElements.delete(el);
          }
        });
        return;
      }

      if (!translatedTextResult.success || !translatedTextResult.translatedTexts) {
        errorLog('Error translating elements:', translatedTextResult.error);

        for (let i = 0; i < overlaysInBatch.length; i++) {
          overlaysInBatch[i].overlay.setError(true);

          setTimeout(() => {
            this.removeOverlayFromElement(overlaysInBatch[i].element, overlaysInBatch[i].overlay);
          }, 3000);
        }
        return;
      }

      for (let i = 0; i < overlaysInBatch.length; i++) {
        if (texts[i] === translatedTextResult.translatedTexts[i]) {
          overlaysInBatch[i].overlay.setLoading(false);
          setTimeout(() => {
            this.removeOverlayFromElement(
              overlaysInBatch[i].element,
              overlaysInBatch[i].overlay,
              false
            );
          }, 3000);
        } else {
          overlaysInBatch[i].overlay.setTexts(translatedTextResult.translatedTexts[i]);
        }
      }
    } catch (err) {
      errorLog('Error in batch translation API call:', err);
      overlaysInBatch.forEach(({ element, overlay }) => {
        overlay.setError(true);
        setTimeout(() => {
          this.removeOverlayFromElement(element, overlay, true);
        }, 3000);
      });
    } finally {
      this.isProcessingBatch = false;
      if (this.isActive) this.processTranslationQueue();
    }
  }

  // Translate visible elements
  private async translateVisibleElements() {
    if (!this.isActive) return;
    try {
      const elements = this.findTranslatableElements().filter(
        (element) => !this.queuedElements.has(element)
      );
      if (elements.length === 0) {
        return;
      }

      elements.forEach((element) => this.queuedElements.add(element));

      const batches = this.createTranslationBatches(elements);

      if (batches.length > 0) {
        this.translationQueue.push(...batches);
        this.processTranslationQueue();
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
    // Check if element is already translated
    if (
      element.querySelector('shizue-translation-overlay') !== null ||
      element.tagName === 'SHIZUE-TRANSLATION-OVERLAY'
    ) {
      return false;
    }

    const text = element.textContent?.trim();

    if (!text || text.length === 0 || text.length > 2000) {
      return false;
    }

    // Check if the text is just one alphabet
    if (/^[a-zA-Z]$/.test(text)) {
      return false;
    }

    // Check if actual text is included
    // all except numbers
    if (!/\p{L}/u.test(text)) {
      return false;
    }

    // Check if element is editable
    if ((element as HTMLElement).isContentEditable) {
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
    if (
      textElements.includes(element.tagName) &&
      window.getComputedStyle(element).display === 'inline'
    ) {
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
