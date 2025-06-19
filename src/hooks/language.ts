import { STORAGE_LANGUAGE, STORAGE_TRANSLATE_TARGET_LANGUAGE } from '@/config/constants';
import i18n from '@/i18n';
import { determineAppLanguage } from '@/lib/language';
import { chromeStorageBackend } from '@/lib/storageBackend';
import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Language =
  | 'English'
  | 'Korean_한국어'
  | 'ChineseSimplified_简体中文'
  | 'ChineseTraditional_繁體中文'
  | 'Japanese_日本語'
  | 'Spanish_Español'
  | 'French_Français'
  | 'PortugueseBR_Português'
  | 'PortuguesePT_Português'
  | 'Russian_Русский'
  | 'Hindi_हिंदी'
  | 'Italian_Italiano'
  | 'German_Deutsch'
  | 'Polish_Polski'
  | 'Turkish_Türkçe'
  | 'Arabic_العربية'
  | 'Filipino_Tagalog'
  | 'Bengali_বাংলা'
  | 'Urdu_اردو'
  | 'Swahili_Kiswahili'
  | 'Vietnamese_Tiếng Việt'
  | 'Persian_فارسی';

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
    case 'Korean_한국어':
      return 'ko';
    case 'ChineseSimplified_简体中文':
      return 'zh_CN';
    case 'ChineseTraditional_繁體中文':
      return 'zh_TW';
    case 'Japanese_日本語':
      return 'ja';
    case 'Spanish_Español':
      return 'es';
    case 'French_Français':
      return 'fr';
    case 'PortugueseBR_Português':
      return 'pt_BR';
    case 'PortuguesePT_Português':
      return 'pt_PT';
    case 'Russian_Русский':
      return 'ru';
    case 'Hindi_हिंदी':
      return 'hi';
    case 'Italian_Italiano':
      return 'it';
    case 'German_Deutsch':
      return 'de';
    case 'Polish_Polski':
      return 'pl';
    case 'Turkish_Türkçe':
      return 'tr';
    case 'Arabic_العربية':
      return 'ar';
    case 'Filipino_Tagalog':
      return 'fil';
    case 'Bengali_বাংলা':
      return 'bn';
    case 'Urdu_اردو':
      return 'ur';
    case 'Swahili_Kiswahili':
      return 'sw';
    case 'Vietnamese_Tiếng Việt':
      return 'vi';
    case 'Persian_فارسی':
      return 'fa';
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

export const useTranslateTargetLanguageValue = () => useAtomValue(targetLanguageAtom);
export const useTranslateTargetLanguage = () => useAtom(targetLanguageAtom);
