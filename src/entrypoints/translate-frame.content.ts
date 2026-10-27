import { MESSAGE_FRAME_TRANSLATION_STATE } from '@/config/constants';
import type { Language } from '@/hooks/language';
import { getPageTranslator } from '@/lib/pageTranslator';

// Translates a frame while the page around it is translated. Nothing runs in frames otherwise:
// the background injects this into the tab's frames when page translation starts or a frame
// loads (PageTranslator.syncFrames), then tells every frame whether translation is on.
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    const marker = '__shizueFrameTranslator';
    if (window === window.top || (window as any)[marker]) return;
    (window as any)[marker] = true;
    // Tracking pixels, buttons and other tiny frames aren't worth a translation request.
    if (innerWidth < 150 || innerHeight < 50) return;

    const translator = getPageTranslator();
    let wanted: { active: boolean; language: Language | null } = { active: false, language: null };
    let translating: Language | null = null;
    // A frame starts translating once it first shows on screen, so ads and other frames far
    // down the page cost nothing until the reader gets there.
    let seen = false;

    const apply = () => {
      const language = wanted.active && seen ? wanted.language : null;
      if (language === translating) return;
      if (translating) translator.deactivate();
      if (language) translator.activate(language);
      translating = language;
    };

    new IntersectionObserver((entries) => {
      if (seen || !entries.some((entry) => entry.isIntersecting)) return;
      seen = true;
      apply();
    }).observe(document.documentElement);

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.action !== MESSAGE_FRAME_TRANSLATION_STATE) return;
      wanted = { active: Boolean(message.active), language: message.targetLanguage ?? null };
      apply();
    });
  },
});
