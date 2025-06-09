import { Language } from '@/hooks/language';
import { TFunction } from 'i18next';

export const languageCodeToLanguage = (languageCode: string): Language | undefined => {
  if (languageCode.startsWith('ko')) {
    return 'Korean';
  } else if (languageCode.startsWith('zh')) {
    return 'Chinese';
  } else if (languageCode.startsWith('ja')) {
    return 'Japanese';
  } else if (languageCode.startsWith('es')) {
    return 'Spanish';
  } else if (languageCode.startsWith('fr')) {
    return 'French';
  } else if (languageCode.startsWith('pt')) {
    return 'Portuguese';
  } else if (languageCode.startsWith('ru')) {
    return 'Russian';
  } else if (languageCode.startsWith('hi')) {
    return 'Hindi';
  } else if (languageCode.startsWith('it')) {
    return 'Italian';
  } else if (languageCode.startsWith('de')) {
    return 'German';
  } else if (languageCode.startsWith('pl')) {
    return 'Polish';
  } else if (languageCode.startsWith('tr')) {
    return 'Turkish';
  } else if (languageCode.startsWith('ar')) {
    return 'Arabic';
  } else if (languageCode.startsWith('en')) {
    return 'English';
  } else {
    return;
  }
};

export const determineAppLanguage = (uiLang: string): Language => {
  const uiText = languageCodeToLanguage(uiLang);
  return uiText ?? 'English';
};

export const languageOptions = (t: TFunction) => [
  {
    value: 'English',
    label: t('language.English'),
    desc: 'English',
  },
  {
    value: 'Korean',
    label: t('language.Korean'),
    desc: '한국어',
  },
  {
    value: 'Chinese',
    label: t('language.Chinese'),
    desc: '中文',
  },
  {
    value: 'Japanese',
    label: t('language.Japanese'),
    desc: '日本語',
  },
  {
    value: 'Spanish',
    label: t('language.Spanish'),
    desc: 'Español',
  },
  {
    value: 'French',
    label: t('language.French'),
    desc: 'Français',
  },
  {
    value: 'Portuguese',
    label: t('language.Portuguese'),
    desc: 'Português',
  },
  {
    value: 'Russian',
    label: t('language.Russian'),
    desc: 'Русский',
  },
  {
    value: 'Hindi',
    label: t('language.Hindi'),
    desc: 'हिंदी',
  },
  {
    value: 'Italian',
    label: t('language.Italian'),
    desc: 'Italiano',
  },
  {
    value: 'German',
    label: t('language.German'),
    desc: 'Deutsch',
  },
  {
    value: 'Polish',
    label: t('language.Polish'),
    desc: 'Polski',
  },
  {
    value: 'Turkish',
    label: t('language.Turkish'),
    desc: 'Türkçe',
  },
  {
    value: 'Arabic',
    label: t('language.Arabic'),
    desc: 'العربية',
  },
];
