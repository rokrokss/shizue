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
    this.isLoading = true; // 기본적으로 로딩 상태로 시작
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
    if (textElements.includes(parentElement.tagName) && window.getComputedStyle(parentElement).display === 'inline') {
      this.style.display = 'inline';
    } else {
      this.style.display = 'block';
    }

    if (this.isLoading) {
      this.style.opacity = '1';
      this.innerHTML = `
        <style>
          .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #32CCBC;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
            vertical-align: middle;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
        </style>
        <div class="spinner"></div>
      `;
    } else {
      this.style.opacity = '0.5';
      this.innerHTML = this.translatedText;
    }
  }

  // Public methods for external control
  setTexts(translatedText: string) {
    this.translatedText = translatedText;
    this.isLoading = false; // 텍스트가 설정되면 로딩 완료
    this.hasError = false; // 성공 시 에러 상태 해제
    this.render();
  }

  // 로딩 상태 설정
  setLoading(loading: boolean) {
    this.isLoading = loading;
    if (loading) {
      this.hasError = false; // 로딩 시 에러 상태 해제
    }
    this.render();
  }

  // 에러 상태 설정
  setError(hasError: boolean) {
    this.hasError = hasError;
    if (hasError) {
      this.isLoading = false; // 에러 시 로딩 상태 해제
    }
    this.render();
  }

  // 로딩 상태 반환
  getLoading(): boolean {
    return this.isLoading;
  }

  // 에러 상태 반환
  getError(): boolean {
    return this.hasError;
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
