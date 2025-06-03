import { STORAGE_LANGUAGE, STORAGE_TRANSLATE_TARGET_LANGUAGE } from '@/config/constants';
import i18n from '@/i18n';
import { determineAppLanguage } from '@/lib/language';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Language =
  | 'English'
  | 'Korean'
  | 'Chinese'
  | 'Japanese'
  | 'Spanish'
  | 'French'
  | 'Portuguese'
  | 'Russian'
  | 'Hindi'
  | 'Italian'
  | 'German'
  | 'Polish'
  | 'Turkish'
  | 'Arabic';

const fallbackLanguage: Language = (() => {
  const uiLang = chrome.i18n.getUILanguage();
  return determineAppLanguage(uiLang);
})();

export const languageAtom = atomWithStorage<Language>(
  STORAGE_LANGUAGE,
  fallbackLanguage,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const targetLanguageAtom = atomWithStorage<Language>(
  STORAGE_TRANSLATE_TARGET_LANGUAGE,
  fallbackLanguage,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const getI8NLanguage = (language: Language) => {
  switch (language) {
    case 'Korean':
      return 'ko';
    case 'Chinese':
      return 'zh';
    case 'Japanese':
      return 'ja';
    case 'Spanish':
      return 'es';
    case 'French':
      return 'fr';
    case 'Portuguese':
      return 'pt';
    case 'Russian':
      return 'ru';
    case 'Hindi':
      return 'hi';
    case 'Italian':
      return 'it';
    case 'German':
      return 'de';
    case 'Polish':
      return 'pl';
    case 'Turkish':
      return 'tr';
    case 'Arabic':
      return 'ar';
    case 'English':
    default:
      return 'en';
  }
};

export const useLanguage = () => {
  const [lang, setLangRaw] = useAtom(languageAtom);

  const setLang = (newLang: typeof lang) => {
    setLangRaw(newLang);
    i18n.changeLanguage(getI8NLanguage(newLang));
  };

  return { lang, setLang };
};

export const useTranslateTargetLanguage = () => useAtom(targetLanguageAtom);
