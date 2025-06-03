import { STORAGE_LANGUAGE, STORAGE_TRANSLATE_TARGET_LANGUAGE } from '@/config/constants';
import { Language } from '@/hooks/language';
import { determineAppLanguage } from '@/lib/language';

let currentLang: Language = determineAppLanguage(chrome.i18n.getUILanguage());
let currentTranslationTargetLang: Language = determineAppLanguage(chrome.i18n.getUILanguage());

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
    if (res.TRANSLATE_TARGET_LANGUAGE)
      changeTranslationTargetLanguage(res.TRANSLATE_TARGET_LANGUAGE as Language);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.LANGUAGE) {
        changeLanguage(changes.LANGUAGE.newValue as Language);
      }
      if (changes.TRANSLATE_TARGET_LANGUAGE) {
        changeTranslationTargetLanguage(changes.TRANSLATE_TARGET_LANGUAGE.newValue as Language);
      }
    }
  });
};
