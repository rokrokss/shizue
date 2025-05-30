import {
  ShizueTranslationOverlay,
  registerShizueTranslationOverlay,
} from '@/components/Translation/ShizueTranslationOverlay';
import { getCurrentLanguage, getLanguageName, translateText } from '@/lib/translation';
import { debugLog, errorLog } from '@/logs';

export class PageTranslationService {
  private isActive: boolean = false;
  private observer: MutationObserver | null = null;
  private translatedElements: Set<Element> = new Set();
  private scrollTimeout: NodeJS.Timeout | null = null;
  private lastScrollTime: number = 0;

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
        if (
          mutation.type === 'characterData' ||
          (mutation.type === 'childList' && mutation.target.nodeType === Node.ELEMENT_NODE)
        ) {
          hasNewContent = true;
        }
      });

      if (hasNewContent) {
        // 디바운스를 위해 약간의 지연
        // FIXME: 디바운스가 제대로 되고 있지 않습니다. 번역 중 새로운 요소가 추가되면 다시 요청이 진행되는 문제가 있습니다
        // setTimeout(() => this.translateVisibleElements(), 500);
      }
    });
  }

  // 번역 활성화/비활성화 토글
  public toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
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
        attributes: false,
      });
    }

    // 스크롤 이벤트 리스너 추가
    this.addScrollListener();
  }

  // DOM 관찰 중지
  private stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
    }

    // 스크롤 이벤트 리스너 제거
    this.removeScrollListener();
  }

  // 스크롤 이벤트 리스너 추가
  private addScrollListener() {
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    debugLog('스크롤 이벤트 리스너 추가됨');
  }

  // 스크롤 이벤트 리스너 제거
  private removeScrollListener() {
    window.removeEventListener('scroll', this.handleScroll);
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    debugLog('스크롤 이벤트 리스너 제거됨');
  }

  // 스크롤 이벤트 핸들러 (디바운싱 적용)
  private handleScroll = () => {
    if (!this.isActive) return;

    const now = Date.now();
    this.lastScrollTime = now;

    // 기존 타이머 클리어
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // 300ms 디바운싱
    this.scrollTimeout = setTimeout(() => {
      // 마지막 스크롤 이벤트로부터 300ms 경과했는지 확인
      if (Date.now() - this.lastScrollTime >= 300) {
        debugLog('스크롤 완료 - 새로운 요소 번역 시작');
        this.translateVisibleElements();
      }
    }, 300);
  };

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
    if (!this.isActive) return;
    try {
      const targetLanguage = getLanguageName(await getCurrentLanguage());
      const elements = this.findTranslatableElements();

      debugLog(`번역 대상 요소 ${elements.length}개 발견`);

      for (const element of elements) {
        if (this.translatedElements.has(element)) continue;
        this.translatedElements.add(element);
        const text = element.innerHTML?.trim();
        if (!text) continue;

        // 스피너가 있는 오버레이를 먼저 생성
        const overlay = this.attachTranslationOverlay(element);
        overlay.setLoading(true);

        try {
          // 번역 요청
          const translatedText = await translateText({
            text,
            targetLanguage,
          });

          if (translatedText.success && translatedText.translatedText) {
            overlay.setTexts(element, translatedText.translatedText);
          } else {
            // 번역 실패 시 에러 상태 표시 후 제거
            overlay.setError(true);
            errorLog('번역 중 오류:', translatedText.error);

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
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      errorLog('요소 번역 중 오류:', error);
    }
  }

  // 번역 가능한 요소들 찾기
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
    if (
      element.querySelector('shizue-translation-overlay') !== null ||
      element.tagName === 'SHIZUE-TRANSLATION-OVERLAY'
    ) {
      return false;
    }

    // 텍스트 관련 요소이거나 리프 노드인지 확인
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

    // 스크롤 관련 리소스 정리
    this.removeScrollListener();

    debugLog('PageTranslator 리소스 정리 완료');
  }
}

// 전역 인스턴스
let globalPageTranslationService: PageTranslationService | null = null;

// 전역 PageTranslator 인스턴스 가져오기
export const getPageTranslationService = (): PageTranslationService => {
  if (!globalPageTranslationService) {
    globalPageTranslationService = new PageTranslationService();
  }
  return globalPageTranslationService;
};
