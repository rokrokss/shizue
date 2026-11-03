import { STORAGE_LANGUAGE, STORAGE_TRANSLATE_TARGET_LANGUAGE } from '@/config/constants';
import i18n from '@/i18n';
import { determineAppLanguage, getI8NLanguage } from '@/lib/language';
import { atomWithChromeStorage } from '@/lib/atomWithChromeStorage';
import { useAtom, useAtomValue } from 'jotai';

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
  | 'Persian_فارسی'
  | 'Thai_ภาษาไทย';

const fallbackLanguage: Language = (() => {
  const uiLang = chrome.i18n.getUILanguage();
  return determineAppLanguage(uiLang);
})();

export const languageAtom = atomWithChromeStorage<Language>(
  STORAGE_LANGUAGE,
  fallbackLanguage
);

export const targetLanguageAtom = atomWithChromeStorage<Language>(
  STORAGE_TRANSLATE_TARGET_LANGUAGE,
  fallbackLanguage
);

export { getI8NLanguage };

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
