import { STORAGE_LANGUAGE, STORAGE_TRANSLATE_TARGET_LANGUAGE } from '@/config/constants';
import i18n from '@/i18n';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Language = 'English' | 'Korean';

const fallbackLanguage: Language = (() => {
  const lang = chrome.i18n.getUILanguage();
  return lang.startsWith('ko') ? 'Korean' : 'English';
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
  return language === 'Korean' ? 'ko' : 'en';
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
