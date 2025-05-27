import { STORAGE_LANGUAGE } from '@/config/constants';
import { debugLog } from '@/logs';

type Language = 'English' | 'Korean';
let currentLang: Language = chrome.i18n.getUILanguage().startsWith('ko') ? 'Korean' : 'English';

const changeLanguage = (lang: string) => {
  currentLang = lang.startsWith('ko') ? 'Korean' : 'English';
  debugLog('currentLang', currentLang);
};

export const getCurrentLanguage = () => currentLang;

export const languageListeners = () => {
  chrome.storage.local.get(STORAGE_LANGUAGE, (res) => {
    if (res.LANGUAGE) changeLanguage(res.LANGUAGE as Language);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.LANGUAGE) {
      changeLanguage(changes.LANGUAGE.newValue as Language);
    }
  });
};
