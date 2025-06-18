import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from '@/locales/ar.json';
import de from '@/locales/de.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fil from '@/locales/fil.json';
import fr from '@/locales/fr.json';
import hi from '@/locales/hi.json';
import it from '@/locales/it.json';
import ja from '@/locales/ja.json';
import ko from '@/locales/ko.json';
import pl from '@/locales/pl.json';
import pt_br from '@/locales/pt_BR.json';
import pt_pt from '@/locales/pt_PT.json';
import ru from '@/locales/ru.json';
import tr from '@/locales/tr.json';
import zh_cn from '@/locales/zh_CN.json';
import zh_tw from '@/locales/zh_TW.json';

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
  | 'ar'
  | 'fil';

export const resources = {
  en: { translation: en },
  ko: { translation: ko },
  zh_CN: { translation: zh_cn },
  zh_TW: { translation: zh_tw },
  ja: { translation: ja },
  es: { translation: es },
  fr: { translation: fr },
  pt_BR: { translation: pt_br },
  pt_PT: { translation: pt_pt },
  ru: { translation: ru },
  hi: { translation: hi },
  it: { translation: it },
  de: { translation: de },
  pl: { translation: pl },
  tr: { translation: tr },
  ar: { translation: ar },
  fil: { translation: fil },
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
