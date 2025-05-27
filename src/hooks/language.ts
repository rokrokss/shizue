import { STORAGE_LANGUAGE } from '@/config/constants';
import i18n from '@/i18n';
import { chromeStorageBackend } from '@/utils/storageBackend';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Language = 'en' | 'ko';

const fallbackLanguage: Language = (() => {
  const lang = chrome.i18n.getUILanguage();
  return lang.startsWith('ko') ? 'ko' : 'en';
})();

export const languageAtom = atomWithStorage<Language>(
  STORAGE_LANGUAGE,
  fallbackLanguage,
  chromeStorageBackend('local'),
  { getOnInit: true }
);

export const useLanguage = () => {
  const [lang, setLangRaw] = useAtom(languageAtom);

  const setLang = (newLang: typeof lang) => {
    setLangRaw(newLang);
    i18n.changeLanguage(newLang);
  };

  return { lang, setLang };
};
