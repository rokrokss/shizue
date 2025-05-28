import { ShizueTranslationOverlay, registerShizueTranslationOverlay } from '@/components/Translation/ShizueTranslationOverlay';
import { debugLog, errorLog } from '@/logs';
import { getCurrentLanguage, getLanguageName, translateText } from './translation';

export class PageTranslator {
  private isActive: boolean = false;
  private observer: MutationObserver | null = null;
  private translatedElements: Set<Element> = new Set();

  constructor() {
    // 웹 컴포넌트 등록 확인
    registerShizueTranslationOverlay();
    this.setupMutationObserver();
  }

  // MutationObserver 설정
  private setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isActive) return;

      let hasNewContent = false;
      
      mutations.forEach((mutation) => {
        // 새로 추가된 노드들 확인
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            hasNewContent = true;
          }
        });

        // 텍스트 변경 감지
        if (mutation.type === 'characterData' || 
            (mutation.type === 'childList' && mutation.target.nodeType === Node.ELEMENT_NODE)) {
          hasNewContent = true;
        }
      });

      if (hasNewContent) {
        // 디바운스를 위해 약간의 지연
        setTimeout(() => this.translateVisibleElements(), 500);
      }
    });
  }

  // 번역 활성화/비활성화 토글
  public toggle(): boolean {
    if (this.isActive) {
      this.deactivate();
      return false;
    } else {
      this.activate();
      return true;
    }
  }

  // 번역 활성화
  private activate() {
    this.isActive = true;
    this.startObserving();
    this.translateVisibleElements();
    debugLog('페이지 번역 활성화됨');
  }

  // 번역 비활성화
  private deactivate() {
    this.isActive = false;
    this.stopObserving();
    this.removeAllTranslations();
    debugLog('페이지 번역 비활성화됨');
  }

  // DOM 관찰 시작
  private startObserving() {
    if (this.observer) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: false
      });
    }
  }

  // DOM 관찰 중지
  private stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  // 모든 번역 제거
  private removeAllTranslations() {
    this.translatedElements.forEach((element) => {
      const overlay = element.querySelector('shizue-translation-overlay') as Element;
      if (overlay) {
        element.removeChild(overlay);
      }
    });
    this.translatedElements.clear();
  }

  // 화면에 보이는 요소들 번역
  private async translateVisibleElements() {
    try {
      const targetLanguage = getLanguageName(await getCurrentLanguage());
      const elements = this.findTranslatableElements();
      
      debugLog(`번역 대상 요소 ${elements.length}개 발견`);

      for (const element of elements) {
        if (this.translatedElements.has(element)) continue;
        this.translatedElements.add(element);
        
        const text = element.textContent?.trim();
        if (!text) continue;

        // 스피너가 있는 오버레이를 먼저 생성
        const overlay = this.attachTranslationOverlay(element);
        overlay.setLoading(true);
        
        try {
          // 번역 요청
          const translatedText = await translateText({
            text, 
            targetLanguage
          });
          
          if (translatedText.success && translatedText.translatedText) {
            overlay.setTexts(element, translatedText.translatedText);
          } else {
            // 번역 실패 시 에러 상태 표시 후 제거
            overlay.setError(true);
            
            // 3초 후 오버레이 제거
            setTimeout(() => {
              if (element.contains(overlay)) {
                element.removeChild(overlay);
                this.translatedElements.delete(element);
              }
            }, 3000);
          }
        } catch (error) {
          // 오류 발생 시 에러 상태 표시 후 제거
          overlay.setError(true);
          errorLog('번역 중 오류:', error);
          
          // 3초 후 오버레이 제거
          setTimeout(() => {
            try {
              if (element.contains(overlay)) {
                element.removeChild(overlay);
                this.translatedElements.delete(element);
              }
            } catch (removeError) {
              debugLog('오버레이 제거 중 오류:', removeError);
            }
          }, 3000);
        }
          
        // API 호출 제한 방지
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      errorLog('요소 번역 중 오류:', error);
    }
  }

  // 번역 가능한 요소들 찾기
  private findTranslatableElements(): Element[] {
    const elements: Element[] = [];
    debugLog(document.body);
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const element = node as Element;
          
          if (!this.isElementVisible(element)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (this.isTranslatableElement(element)) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      elements.push(node as Element);
    }

    return elements;
  }

  // 요소가 화면에 보이는지 확인
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

  // 번역 가능한 요소인지 확인
  private isTranslatableElement(element: Element): boolean {
    const text = element.textContent?.trim();
    
    if (!text || text.length === 0 || text.length > 2000) {
      return false;
    }

    // 실제 텍스트가 포함되어 있는지 확인
    if (!/[a-zA-Z가-힣]/.test(text)) {
      return false;
    }

    // 이미 번역된 요소인지 확인
    if (element.querySelector('shizue-translation-overlay') !== null) {
      return false;
    }

    // 텍스트 관련 요소이거나 리프 노드인지 확인
    const textElements = ['SPAN', 'STRONG', 'EM', 'A', 'B', 'I', 'U', 'MARK', 'SMALL', 'SUB', 'SUP'];
    if (textElements.includes(element.tagName)) {
      return false;
    }
    if (!Array.from(element.children).every(child => textElements.includes(child.tagName))) {
      return false;
    }
    return true;
  }

  private attachTranslationOverlay(element: Element): ShizueTranslationOverlay {
    const overlay = document.createElement('shizue-translation-overlay') as ShizueTranslationOverlay;
    element.appendChild(overlay);
    return overlay;
  }


  // 현재 활성 상태 반환
  public isTranslationActive(): boolean {
    return this.isActive;
  }

  // 리소스 정리
  public destroy() {
    this.deactivate();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// 전역 인스턴스
let globalPageTranslator: PageTranslator | null = null;

// 전역 PageTranslator 인스턴스 가져오기
export const getPageTranslator = (): PageTranslator => {
  if (!globalPageTranslator) {
    globalPageTranslator = new PageTranslator();
  }
  return globalPageTranslator;
}; 
