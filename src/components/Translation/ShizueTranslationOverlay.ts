import { debugLog, errorLog } from '@/logs';
import '@webcomponents/custom-elements';

// Shizue Translation Overlay Web Component
class ShizueTranslationOverlay extends HTMLElement {
  private originalElement: Element | null;
  private translatedText: string;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.originalElement = null;
    this.translatedText = '';
  }

  static get observedAttributes() {
    return ['original-text', 'translated-text'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    if (!this.shadowRoot) return;
    this.style.opacity = '0.5';
    this.shadowRoot.innerHTML = this.translatedText;
  }
  // Public methods for external control
  setTexts(originalElement: Element, translatedText: string) {
    console.log('setTexts', originalElement, translatedText);

    if (originalElement.children.length !== 0 || originalElement.tagName === 'P') {
      this.style.display = 'block';
    }

    this.originalElement = originalElement;
    this.translatedText = translatedText;
    this.render();
  }
}

// Function to register the web component
export const registerShizueTranslationOverlay = (): boolean => {
  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      debugLog('웹 컴포넌트 등록 스킵: 브라우저 환경이 아님');
      return false;
    }

    // Check if customElements is available
    if (typeof customElements === 'undefined' || !customElements) {
      errorLog('customElements API가 사용할 수 없습니다');
      return false;
    }

    // Check if already registered
    if (customElements.get('shizue-translation-overlay')) {
      debugLog('ShizueTranslationOverlay 웹 컴포넌트가 이미 등록되어 있습니다');
      return true;
    }

    // Register the component
    customElements.define('shizue-translation-overlay', ShizueTranslationOverlay);
    debugLog('ShizueTranslationOverlay 웹 컴포넌트가 성공적으로 등록되었습니다');
    return true;

  } catch (error) {
    errorLog('웹 컴포넌트 등록 중 오류:', error);
    return false;
  }
};

// Auto-register when module loads in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Use setTimeout to ensure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerShizueTranslationOverlay);
  } else {
    registerShizueTranslationOverlay();
  }
}

export { ShizueTranslationOverlay };
export default ShizueTranslationOverlay;
