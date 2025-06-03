import { TFunction } from 'i18next';

export const determineAppLanguage = (uiLang: string): Language => {
  if (uiLang.startsWith('ko')) {
    return 'Korean';
  } else if (uiLang.startsWith('zh')) {
    return 'Chinese';
  } else if (uiLang.startsWith('ja')) {
    return 'Japanese';
  } else if (uiLang.startsWith('es')) {
    return 'Spanish';
  } else if (uiLang.startsWith('fr')) {
    return 'French';
  } else if (uiLang.startsWith('pt')) {
    return 'Portuguese';
  } else if (uiLang.startsWith('ru')) {
    return 'Russian';
  } else if (uiLang.startsWith('hi')) {
    return 'Hindi';
  } else if (uiLang.startsWith('it')) {
    return 'Italian';
  } else if (uiLang.startsWith('de')) {
    return 'German';
  } else if (uiLang.startsWith('pl')) {
    return 'Polish';
  } else if (uiLang.startsWith('tr')) {
    return 'Turkish';
  } else if (uiLang.startsWith('ar')) {
    return 'Arabic';
  } else if (uiLang.startsWith('en')) {
    return 'English';
  } else {
    return 'English';
  }
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
