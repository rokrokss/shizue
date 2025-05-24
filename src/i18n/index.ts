import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/locales/en.json';
import ko from '@/locales/ko.json';

export const resources = {
  en: { translation: en },
  ko: { translation: ko },
};

export async function initI18n(lang: 'en' | 'ko') {
  await i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export default i18n;
