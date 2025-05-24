import { languageAtom } from '@/atoms/language';
import i18n from '@/i18n';
import { useAtom } from 'jotai';

export function useLanguage() {
  const [lang, setLangRaw] = useAtom(languageAtom);

  const setLang = (newLang: typeof lang) => {
    setLangRaw(newLang);
    i18n.changeLanguage(newLang);
  };

  return { lang, setLang };
}
