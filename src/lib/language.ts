import { Language } from '@/hooks/language';
import { TFunction } from 'i18next';

export const languageCodeToLanguage = (languageCode: string): Language | undefined => {
  if (languageCode.startsWith('ko')) {
    return 'Korean_한국어';
  } else if (languageCode.startsWith('zh')) {
    if (languageCode.includes('TW') || languageCode.includes('HK')) {
      return 'ChineseTraditional_繁體中文';
    } else {
      return 'ChineseSimplified_简体中文';
    }
  } else if (languageCode.startsWith('ja')) {
    return 'Japanese_日本語';
  } else if (languageCode.startsWith('es')) {
    return 'Spanish_Español';
  } else if (languageCode.startsWith('fr')) {
    return 'French_Français';
  } else if (languageCode.startsWith('pt')) {
    if (languageCode.includes('PT')) {
      return 'PortuguesePT_Português';
    } else {
      return 'PortugueseBR_Português';
    }
  } else if (languageCode.startsWith('ru')) {
    return 'Russian_Русский';
  } else if (languageCode.startsWith('hi')) {
    return 'Hindi_हिंदी';
  } else if (languageCode.startsWith('it')) {
    return 'Italian_Italiano';
  } else if (languageCode.startsWith('de')) {
    return 'German_Deutsch';
  } else if (languageCode.startsWith('pl')) {
    return 'Polish_Polski';
  } else if (languageCode.startsWith('tr')) {
    return 'Turkish_Türkçe';
  } else if (languageCode.startsWith('ar')) {
    return 'Arabic_العربية';
  } else if (languageCode.startsWith('fil')) {
    return 'Filipino_Tagalog';
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
    value: 'Korean_한국어',
    label: t('language.Korean'),
    desc: '한국어',
  },
  {
    value: 'ChineseSimplified_简体中文',
    label: t('language.ChineseSimplified'),
    desc: '简体中文',
  },
  {
    value: 'ChineseTraditional_繁體中文',
    label: t('language.ChineseTraditional'),
    desc: '繁體中文',
  },
  {
    value: 'Japanese_日本語',
    label: t('language.Japanese'),
    desc: '日本語',
  },
  {
    value: 'Spanish_Español',
    label: t('language.Spanish'),
    desc: 'Español',
  },
  {
    value: 'French_Français',
    label: t('language.French'),
    desc: 'Français',
  },
  {
    value: 'PortugueseBR_Português',
    label: t('language.PortugueseBR'),
    desc: 'Português (Brasil)',
  },
  {
    value: 'PortuguesePT_Português',
    label: t('language.PortuguesePT'),
    desc: 'Português (Portugal)',
  },
  {
    value: 'Russian_Русский',
    label: t('language.Russian'),
    desc: 'Русский',
  },
  {
    value: 'Hindi_हिंदी',
    label: t('language.Hindi'),
    desc: 'हिंदी',
  },
  {
    value: 'Italian_Italiano',
    label: t('language.Italian'),
    desc: 'Italiano',
  },
  {
    value: 'German_Deutsch',
    label: t('language.German'),
    desc: 'Deutsch',
  },
  {
    value: 'Polish_Polski',
    label: t('language.Polish'),
    desc: 'Polski',
  },
  {
    value: 'Turkish_Türkçe',
    label: t('language.Turkish'),
    desc: 'Türkçe',
  },
  {
    value: 'Arabic_العربية',
    label: t('language.Arabic'),
    desc: 'العربية',
  },
  {
    value: 'Filipino_Tagalog',
    label: t('language.Filipino'),
    desc: 'Tagalog',
  },
];
