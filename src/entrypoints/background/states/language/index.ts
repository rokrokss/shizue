import { STORAGE_LANGUAGE, STORAGE_TRANSLATE_TARGET_LANGUAGE } from '@/config/constants';
import { Language } from '@/hooks/language';

let currentLang: Language = chrome.i18n.getUILanguage().startsWith('ko') ? 'Korean' : 'English';
let currentTranslationTargetLang: Language = chrome.i18n.getUILanguage().startsWith('ko')
  ? 'Korean'
  : 'English';

const changeLanguage = (lang: Language) => {
  currentLang = lang;
};

const changeTranslationTargetLanguage = (lang: Language) => {
  currentTranslationTargetLang = lang;
};

export const getCurrentLanguage = () => currentLang;

export const getTranslationTargetLanguage = () => currentTranslationTargetLang;

export const languageListeners = () => {
  chrome.storage.local.get(STORAGE_LANGUAGE, (res) => {
    if (res.LANGUAGE) changeLanguage(res.LANGUAGE as Language);
  });
  chrome.storage.local.get(STORAGE_TRANSLATE_TARGET_LANGUAGE, (res) => {
    if (res.LANGUAGE) changeTranslationTargetLanguage(res.LANGUAGE as Language);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local')
      if (changes.LANGUAGE) {
        changeLanguage(changes.LANGUAGE.newValue as Language);
      }
    if (changes.TRANSLATE_TARGET_LANGUAGE) {
      changeTranslationTargetLanguage(changes.TRANSLATE_TARGET_LANGUAGE.newValue as Language);
    }
  });
};
