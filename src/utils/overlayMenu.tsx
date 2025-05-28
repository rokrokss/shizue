import BookIcon from '@/assets/icons/book.svg?react';
import ChatIcon from '@/assets/icons/chat.svg?react';
import ScreenshotIcon from '@/assets/icons/screenshot.svg?react';
import SettingIcon from '@/assets/icons/setting.svg?react';
import TranslateIcon from '@/assets/icons/translate.svg?react';
import '@/components/Translation/ShizueTranslationOverlay';
import { debugLog } from '@/logs';
import { translatePageElements } from '@/utils/translation';

export const overlayMenuItems = [
  {
    name: 'Settings',
    onClick: () => {},
    icon: <SettingIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.settings',
  },
  {
    name: 'Screenshot',
    onClick: () => {},
    icon: <ScreenshotIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.screenshot',
  },
  {
    name: 'Summarize this Page',
    onClick: () => {},
    icon: <BookIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.summarizePage',
  },
  {
    name: 'Translate this Page',
    onClick: async () => {
      const visibleElements = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            const element = node as Element;
            // 화면에 보이는 요소만 수집 (display: none, visibility: hidden 제외)
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            
            return (style.display !== 'none' && 
                    style.visibility !== 'hidden' && 
                    rect.width > 0 && 
                    rect.height > 0 &&
                    isInViewport(element)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );

      // TODO: 적절한 경로로 이동
      const isInViewport = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        );
      }

      const isTargetElement = (element: Element) => {
        const text = element.textContent?.trim();
        if (!text) return false;

        const textElements = ['SPAN', 'STRONG', 'EM', 'A', 'B', 'I', 'U', 'MARK', 'SMALL', 'SUB', 'SUP'];
        if (textElements.includes(element.tagName)) return false;

        if (Array.from(element.children).every(child => textElements.includes(child.tagName))) return true;
        return false;
      }
      
      let node;
      while (node = walker.nextNode()) {
        const element = node as Element;
        
        // 텍스트가 있는 요소들을 번역 대상으로 선택 (리프 노드 + 텍스트 관련 요소들)
        if (isTargetElement(element)) {
          visibleElements.push(element);
        }
      }
      
      debugLog('번역 대상 요소들:', visibleElements);
      
      // 실제 번역 실행 (사용자의 현재 언어 설정 자동 사용)
      await translatePageElements(visibleElements);
    },
    icon: <TranslateIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.translatePage',
  },
  {
    name: 'Quick Chat',
    onClick: () => {},
    icon: <ChatIcon className="sz:w-[20px] sz:h-[20px]" />,
    tooltip: 'overlayMenu.quickChat',
  },
];
