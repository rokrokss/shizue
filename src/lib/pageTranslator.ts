import { ShizueTranslationOverlay } from '@/components/Translation/ShizueTranslationOverlay';
import { MESSAGE_TRANSLATE_FRAMES } from '@/config/constants';
import { Language } from '@/hooks/language';
import { TEXT_ELEMENTS } from '@/lib/html';
import { debugLog, errorLog } from '@/logs';
import { translationService } from '@/services/translationService';

export class PageTranslator {
  private isActive: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  private lastScrollTime: number = 0;
  private readonly MAX_CHARS_PER_API_REQUEST = 1000;

  // properties for robust queueing
  private translationQueue: { elements: Element[]; texts: string[] }[] = [];
  private isProcessingBatch: boolean = false;
  private queuedElements: Set<Element> = new Set();

  private visitedElements: Set<Element> = new Set();

  // Content the page adds or changes after translation starts is scanned like a scroll: once
  // the changes pause for 300ms, and at least once a second on pages that never stop changing.
  private mutationObserver: MutationObserver | null = null;
  private mutationTimeout: ReturnType<typeof setTimeout> | null = null;
  private firstMutationTime: number | null = null;
  private readonly MUTATION_MAX_WAIT = 1000;
  // An element's own text when it was translated, and the translated elements the page has
  // touched since: one whose text changed is translated again.
  private sourceTexts: WeakMap<Element, string> = new WeakMap();
  private changedElements: Set<Element> = new Set();
  private framesTimeout: ReturnType<typeof setTimeout> | null = null;

  private cachedTranslations: Map<string, Map<string, string>> = new Map();

  private targetLanguage: Language | null = null;

  // Activate translation
  public activate(targetLanguage: Language) {
    this.isActive = true;
    this.targetLanguage = targetLanguage;
    if (!this.cachedTranslations.has(targetLanguage)) {
      this.cachedTranslations.set(targetLanguage, new Map());
    }
    this.startObserving();
    this.translateVisibleElements();
    if (window === window.top) this.syncFrames();
    debugLog('Page translation activated');
  }

  private abortCurrentBatch() {
    this.isProcessingBatch = false;
    // TODO: abort controller to stop llm call in background
  }

  // Deactivate translation
  public deactivate() {
    this.isActive = false;
    this.stopObserving();
    this.abortCurrentBatch();
    this.removeAllTranslations();
    this.translationQueue = [];
    this.queuedElements = new Set();
    this.visitedElements = new Set();
    this.changedElements = new Set();
    if (window === window.top) this.syncFrames();
    debugLog('Page translation deactivated');
  }

  // Start observing DOM
  private startObserving() {
    // Add scroll event listener
    this.addScrollListener();
    this.mutationObserver = new MutationObserver(this.handleMutations);
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'open'],
    });
    // Load events don't bubble, but a capturing listener sees every frame that loads.
    document.addEventListener('load', this.handleFrameLoad, true);
  }

  // Stop observing DOM
  private stopObserving() {
    // Remove scroll event listener
    this.removeScrollListener();
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    if (this.mutationTimeout) clearTimeout(this.mutationTimeout);
    this.mutationTimeout = null;
    this.firstMutationTime = null;
    document.removeEventListener('load', this.handleFrameLoad, true);
    if (this.framesTimeout) clearTimeout(this.framesTimeout);
    this.framesTimeout = null;
  }

  private handleMutations = (mutations: MutationRecord[]) => {
    if (!this.isActive) return;
    let pageChanged = false;
    for (const mutation of mutations) {
      if (this.isOwnMutation(mutation)) continue;
      pageChanged = true;
      const translated = this.translatedAncestor(mutation.target);
      if (translated) this.changedElements.add(translated);
    }
    if (pageChanged) this.scheduleMutationScan();
  };

  // Translations, their spinners and Shizue's other elements change the page too; reacting to
  // them would scan again after every translation.
  private isOwnMutation(mutation: MutationRecord): boolean {
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    if (nodes.length > 0 && nodes.every((node) => this.isShizueElement(node))) return true;
    for (let node: Node | null = mutation.target; node; node = node.parentNode) {
      if (this.isShizueElement(node)) return true;
    }
    return false;
  }

  private isShizueElement(node: Node): boolean {
    return node.nodeType === Node.ELEMENT_NODE && node.nodeName.startsWith('SHIZUE-');
  }

  private translatedAncestor(node: Node): Element | null {
    for (let element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      element && element !== document.body;
      element = element.parentElement) {
      if (this.visitedElements.has(element) || this.queuedElements.has(element)) return element;
    }
    return null;
  }

  private scheduleMutationScan() {
    const now = Date.now();
    this.firstMutationTime ??= now;
    if (this.mutationTimeout) clearTimeout(this.mutationTimeout);
    const wait = Math.max(0, Math.min(300, this.firstMutationTime + this.MUTATION_MAX_WAIT - now));
    this.mutationTimeout = setTimeout(() => {
      this.mutationTimeout = null;
      this.firstMutationTime = null;
      if (!this.isActive) return;
      this.forgetChangedTranslations();
      this.translateVisibleElements();
    }, wait);
  }

  // A translated element whose text the page replaced loses its old translation, so the scan
  // that follows translates it again.
  private forgetChangedTranslations() {
    for (const element of this.changedElements) {
      const overlay = ShizueTranslationOverlay.find(element);
      // One still in the queue or on its way is checked again when its translation arrives.
      const waiting =
        this.queuedElements.has(element) &&
        (overlay ? overlay.getLoading() : !this.visitedElements.has(element));
      if (waiting) continue;
      this.changedElements.delete(element);
      const source = this.sourceTexts.get(element);
      if (source === undefined || source === this.ownText(element)) continue;
      overlay?.remove();
      this.visitedElements.delete(element);
      this.queuedElements.delete(element);
      this.sourceTexts.delete(element);
    }
  }

  // The element's text without the translation Shizue added under it.
  private ownText(element: Element): string {
    return Array.from(element.childNodes)
      .filter((node) => node.nodeName !== 'SHIZUE-TRANSLATION-OVERLAY')
      .map((node) => node.textContent)
      .join('');
  }

  // Frames run their own translator (translate-frame.content.ts). The background injects it
  // into this tab's frames and passes this page's state on to them: when translation starts or
  // stops here, and when a frame loads while it is on.
  private syncFrames() {
    void chrome.runtime
      .sendMessage({
        action: MESSAGE_TRANSLATE_FRAMES,
        active: this.isActive,
        targetLanguage: this.targetLanguage,
      })
      .catch((error) => debugLog('Frame translation sync failed', error));
  }

  private handleFrameLoad = (event: Event) => {
    const target = event.target as Element | null;
    if (!this.isActive || (target?.tagName !== 'IFRAME' && target?.tagName !== 'FRAME')) return;
    if (this.framesTimeout) clearTimeout(this.framesTimeout);
    this.framesTimeout = setTimeout(() => {
      this.framesTimeout = null;
      if (this.isActive) this.syncFrames();
    }, 500);
  };

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
    this.visitedElements.forEach((element) => {
      const overlay = element.querySelector('shizue-translation-overlay') as Element;
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    this.visitedElements.clear();
  }

  private removeOverlayFromElement(
    element: Element,
    overlay: ShizueTranslationOverlay,
    removeTranslatedElement: boolean = true
  ) {
    if (element.contains(overlay.element)) {
      element.removeChild(overlay.element);
      if (removeTranslatedElement) {
        if (this.queuedElements.has(element)) {
          this.queuedElements.delete(element);
        }
        if (this.visitedElements.has(element)) {
          this.visitedElements.delete(element);
        }
      }
    }
  }

  private createTranslationBatches(
    items: { element: Element; text: string }[]
  ): { elements: Element[]; texts: string[] }[] {
    debugLog(`Found ${items.length} new elements for potential translation. Creating batches...`);

    const batches: {
      elements: Element[];
      texts: string[];
    }[] = [];

    let currentBatchElements: Element[] = [];
    let currentBatchTexts: string[] = [];
    let currentBatchCharCount = 0;

    for (const { element, text } of items) {
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

    const overlaysInBatch: {
      element: Element;
      overlay: ShizueTranslationOverlay;
      text: string;
    }[] = [];
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const text = texts[i];
      // The page removed it after it was queued (a route change, a replaced list): translating
      // it would only hold up the text on screen now.
      if (!element.isConnected) {
        this.queuedElements.delete(element);
        continue;
      }
      if (this.cachedTranslations.get(this.targetLanguage as string)?.has(text)) {
        const translatedText = this.cachedTranslations
          .get(this.targetLanguage as string)
          ?.get(text) as string;
        debugLog(
          `[processTranslationQueue] cached translation found for ${text}, translatedText: ${translatedText}`
        );
        const overlay = this.overlayFor(element);
        this.visitedElements.add(element);
        if (translatedText.trim() !== '') {
          overlay.setTexts(translatedText);
        } else {
          overlay.setLoading(false);
          setTimeout(() => {
            this.removeOverlayFromElement(element, overlay, false);
          }, 3000);
        }
        if (this.queuedElements.has(element)) {
          this.queuedElements.delete(element);
        }
      } else if (this.queuedElements.has(element)) {
        const overlay = this.overlayFor(element);
        this.visitedElements.add(element);
        overlay.setLoading(true);
        overlaysInBatch.push({ element, overlay, text });
      } else {
        // overlay exists unexpectedly
        if (this.queuedElements.has(element)) {
          this.queuedElements.delete(element);
        }
      }
    }

    // Cached elements are skipped above, so take texts from the batch itself to keep indices aligned.
    const validTextsForApi = overlaysInBatch.map((o) => o.text);

    if (validTextsForApi.length === 0) {
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
          if (el.contains(ov.element)) {
            this.removeOverlayFromElement(el, ov, true);
          } else if (this.queuedElements.has(el)) {
            this.queuedElements.delete(el);
          }
        });
        this.isProcessingBatch = false;
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

        this.isProcessingBatch = false;
        if (this.isActive) this.processTranslationQueue();
        return;
      }

      for (let i = 0; i < overlaysInBatch.length; i++) {
        this.cachedTranslations
          .get(this.targetLanguage as string)
          ?.set(validTextsForApi[i], translatedTextResult.translatedTexts[i]);
        if (
          validTextsForApi[i] === translatedTextResult.translatedTexts[i] ||
          translatedTextResult.translatedTexts[i].trim() === ''
        ) {
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
          if (this.queuedElements.has(overlaysInBatch[i].element)) {
            this.queuedElements.delete(overlaysInBatch[i].element);
          }
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
      debugLog('this.cachedTranslations', this.cachedTranslations);
      this.isProcessingBatch = false;
      // The page may have changed an element while its translation was on the way.
      if (this.isActive && this.changedElements.size > 0) this.scheduleMutationScan();
      if (this.isActive) this.processTranslationQueue();
    }
  }

  // Translate visible elements
  private async translateVisibleElements() {
    debugLog('translateVisibleElements called, isActive:', this.isActive);
    if (!this.isActive) return;
    try {
      const elements = this.findTranslatableElements().filter(
        (element) => !this.queuedElements.has(element)
      );

      if (elements.length === 0) {
        return;
      }

      const queueAbleItems: {
        element: Element;
        text: string;
      }[] = [];

      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const text = element.innerHTML?.trim();
        this.sourceTexts.set(element, this.ownText(element));
        if (this.cachedTranslations.get(this.targetLanguage as string)?.has(text)) {
          const translatedText = this.cachedTranslations
            .get(this.targetLanguage as string)
            ?.get(text) as string;
          debugLog(
            `[translateVisibleElements] cached translation found for ${text}, translatedText: ${translatedText}`
          );
          const overlay = this.attachTranslationOverlay(element);
          this.visitedElements.add(element);
          if (translatedText.trim() !== '') {
            overlay.setTexts(translatedText);
          } else {
            overlay.setLoading(false);
            setTimeout(() => {
              this.removeOverlayFromElement(element, overlay, false);
            }, 3000);
          }
        } else {
          queueAbleItems.push({ element, text });
        }
      }

      // Track queued elements now; attach loaders when their batch starts processing.
      queueAbleItems.forEach(({ element }) => {
        this.queuedElements.add(element);
      });

      const batches = this.createTranslationBatches(queueAbleItems);

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

        if (this.isElementHidden(element)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (!this.isElementVisible(element)) {
          return NodeFilter.FILTER_SKIP;
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

  private isElementHidden(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const hidden =
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      rect.width === 0 ||
      rect.height === 0;
    const isAstroIsland = element.tagName == 'ASTRO-ISLAND';
    return hidden && !isAstroIsland;
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

    if (!text || text.length === 0 || text.length > 5000) {
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

    // Check for TEXT_ELEMENTS that are inline
    if (
      TEXT_ELEMENTS.includes(element.tagName) &&
      window.getComputedStyle(element).display === 'inline'
    ) {
      return false;
    }

    if (element.tagName === 'UL' || element.tagName === 'OL') {
      if (element.parentElement && element.parentElement.tagName === 'LI') {
        return false;
      }
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
    return ShizueTranslationOverlay.attach(element);
  }

  // Reuse an existing overlay, or attach one when the element is processed.
  private overlayFor(element: Element): ShizueTranslationOverlay {
    return ShizueTranslationOverlay.find(element) ?? this.attachTranslationOverlay(element);
  }

  // Return current active state
  public isTranslationActive(): boolean {
    return this.isActive;
  }

  // Clean up resources
  public destroy() {
    this.deactivate();

    // Clean up scroll-related resources
    this.removeScrollListener();
    this.cachedTranslations.clear();

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
