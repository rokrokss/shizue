import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

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
  | 'fil'
  | 'bn'
  | 'ur'
  | 'sw'
  | 'vi'
  | 'fa'
  | 'th';

// Load only the selected locale and the English fallback in the side panel.
// i18next's backend also loads a new locale when the user changes languages.
const localeLoaders = {
  en: () => import('@/locales/en.json'),
  ko: () => import('@/locales/ko.json'),
  zh_CN: () => import('@/locales/zh_CN.json'),
  zh_TW: () => import('@/locales/zh_TW.json'),
  ja: () => import('@/locales/ja.json'),
  es: () => import('@/locales/es.json'),
  fr: () => import('@/locales/fr.json'),
  pt_BR: () => import('@/locales/pt_BR.json'),
  pt_PT: () => import('@/locales/pt_PT.json'),
  ru: () => import('@/locales/ru.json'),
  hi: () => import('@/locales/hi.json'),
  it: () => import('@/locales/it.json'),
  de: () => import('@/locales/de.json'),
  pl: () => import('@/locales/pl.json'),
  tr: () => import('@/locales/tr.json'),
  ar: () => import('@/locales/ar.json'),
  fil: () => import('@/locales/fil.json'),
  bn: () => import('@/locales/bn.json'),
  ur: () => import('@/locales/ur.json'),
  sw: () => import('@/locales/sw.json'),
  vi: () => import('@/locales/vi.json'),
  fa: () => import('@/locales/fa.json'),
  th: () => import('@/locales/th.json'),
} satisfies Record<SupportedLanguageCode, () => Promise<{ default: object }>>;

let initialization: Promise<unknown> | undefined;

export function initI18n(lang: SupportedLanguageCode) {
  // StrictMode and multiple roots can request initialization at the same time.
  initialization ??= i18n.use({
    type: 'backend' as const,
    init() {},
    read(language: string, _namespace: string, callback: (error: Error | null, data?: object) => void) {
      const load = localeLoaders[language as SupportedLanguageCode];
      if (!load) return callback(new Error(`Unsupported language: ${language}`));
      load().then(({ default: messages }) => callback(null, messages), error => callback(error));
    },
  }).use(initReactI18next).init({
    lng: lang,
    supportedLngs: Object.keys(localeLoaders),
    load: 'currentOnly',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  return initialization;
}

export default i18n;
