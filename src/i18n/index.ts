import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from '@/locales/ar.json';
import de from '@/locales/de.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import hi from '@/locales/hi.json';
import it from '@/locales/it.json';
import ja from '@/locales/ja.json';
import ko from '@/locales/ko.json';
import pl from '@/locales/pl.json';
import pt from '@/locales/pt_BR.json';
import ru from '@/locales/ru.json';
import tr from '@/locales/tr.json';
import zh from '@/locales/zh_CN.json';

export type SupportedLanguageCode =
  | 'en'
  | 'ko'
  | 'zh_CN'
  | 'zh_TW'
  | 'ja'
  | 'es'
  | 'fr'
  | 'pt_BR'
  | 'pt_PT'
  | 'ru'
  | 'hi'
  | 'it'
  | 'de'
  | 'pl'
  | 'tr'
  | 'ar';

export const resources = {
  en: { translation: en },
  ko: { translation: ko },
  zh_CN: { translation: zh },
  zh_TW: { translation: zh },
  ja: { translation: ja },
  es: { translation: es },
  fr: { translation: fr },
  pt_BR: { translation: pt },
  pt_PT: { translation: pt },
  ru: { translation: ru },
  hi: { translation: hi },
  it: { translation: it },
  de: { translation: de },
  pl: { translation: pl },
  tr: { translation: tr },
  ar: { translation: ar },
};

export async function initI18n(lang: SupportedLanguageCode) {
  await i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export default i18n;
