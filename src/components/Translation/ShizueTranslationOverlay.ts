import { TEXT_ELEMENTS } from '@/lib/html';
import { debugLog, errorLog } from '@/logs';
import '@webcomponents/custom-elements';

// Shizue Translation Overlay Web Component
class ShizueTranslationOverlay extends HTMLElement {
  private translatedText: string;
  private isLoading: boolean;
  private hasError: boolean;

  constructor() {
    super();
    this.translatedText = '';
    this.isLoading = true;
    this.hasError = false;
  }

  static get observedAttributes() {
    return ['original-text', 'translated-text', 'loading', 'error'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    this.style.visibility = 'visible';
    const parentElement = this.parentElement;
    if (!parentElement) return;
    if (
      TEXT_ELEMENTS.includes(parentElement.tagName) &&
      window.getComputedStyle(parentElement).display === 'inline'
    ) {
      this.style.display = 'inline-block';
    } else {
      this.style.display = 'block';
    }
    this.style.transition = 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out';
    this.style.boxSizing = 'border-box';

    this.style.overflow = 'hidden'; // for max-height transition
    this.style.maxHeight = '0px';

    if (this.isLoading) {
      this.style.maxHeight = '0px';
      setTimeout(() => {
        this.style.opacity = '1';
      }, 0);
      this.innerHTML = `
        <style>
          .shizue-spinner-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 18px;
            padding: 1px 0;
          }
          .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #32CCBC;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
        </style>
        <div class="shizue-spinner-wrapper"><div class="spinner"></div></div>
      `;
      this.style.lineHeight = 'normal';
      setTimeout(() => {
        this.style.maxHeight = '20px';
      }, 0);
    } else {
      this.style.maxHeight = '20px';
      this.innerHTML = this.translatedText;
      this.style.lineHeight = '';
      this.style.opacity = '0.5';

      const targetHeight = this.scrollHeight + 'px';
      if (this.style.maxHeight !== targetHeight) {
        setTimeout(() => {
          this.style.maxHeight = targetHeight;
        }, 0);
        setTimeout(() => {
          this.style.opacity = '0.5';
        }, 0);
        setTimeout(() => {
          this.style.overflow = 'visible';
          this.style.maxHeight = 'none';
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

// Function to register the web component
export const registerShizueTranslationOverlay = (): boolean => {
  try {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      debugLog('Skipping web component registration: Not in browser environment');
      return false;
    }

    // Check if customElements is available
    if (typeof customElements === 'undefined' || !customElements) {
      errorLog('customElements API is not available');
      return false;
    }

    // Check if already registered
    if (customElements.get('shizue-translation-overlay')) {
      debugLog('ShizueTranslationOverlay web component is already registered');
      return true;
    }

    // Register the component
    customElements.define('shizue-translation-overlay', ShizueTranslationOverlay);
    debugLog('ShizueTranslationOverlay web component is successfully registered');
    return true;
  } catch (error) {
    errorLog('Error registering ShizueTranslationOverlay web component:', error);
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
