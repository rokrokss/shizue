import { Language } from '@/hooks/language';
import { TFunction } from 'i18next';

export const languageCodeToLanguage = (languageCode: string): Language | undefined => {
  if (languageCode.startsWith('ko')) {
    return 'Korean_한국어';
  } else if (languageCode.startsWith('zh')) {
    if (languageCode.includes('TW') || languageCode.includes('HK') || languageCode.includes('Hant')) {
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
  } else if (languageCode.startsWith('bn')) {
    return 'Bengali_বাংলা';
  } else if (languageCode.startsWith('ur')) {
    return 'Urdu_اردو';
  } else if (languageCode.startsWith('sw')) {
    return 'Swahili_Kiswahili';
  } else if (languageCode.startsWith('vi')) {
    return 'Vietnamese_Tiếng Việt';
  } else if (languageCode.startsWith('fa')) {
    return 'Persian_فارسی';
  } else if (languageCode.startsWith('th')) {
    return 'Thai_ภาษาไทย';
  } else if (languageCode.startsWith('en')) {
    return 'English';
  } else {
    return;
  }
};

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
    case 'Thai_ภาษาไทย':
      return 'th';
    case 'English':
    default:
      return 'en';
  }
};

const RTL_LANGUAGES: Language[] = ['Arabic_العربية', 'Persian_فارسی', 'Urdu_اردو'];

// The lang and dir of an element holding a translation into this language: Arabic reads from
// the right on an English page, English from the left on an Arabic one, and Japanese gets
// Japanese glyphs on a page in another language.
export const translationAttributes = (language: Language) => ({
  lang: getI8NLanguage(language).replace('_', '-'),
  dir: RTL_LANGUAGES.includes(language) ? ('rtl' as const) : ('ltr' as const),
});

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
  {
    value: 'Bengali_বাংলা',
    label: t('language.Bengali'),
    desc: 'বাংলা',
  },
  {
    value: 'Urdu_اردو',
    label: t('language.Urdu'),
    desc: 'اردو',
  },
  {
    value: 'Swahili_Kiswahili',
    label: t('language.Swahili'),
    desc: 'Kiswahili',
  },
  {
    value: 'Vietnamese_Tiếng Việt',
    label: t('language.Vietnamese'),
    desc: 'Tiếng Việt',
  },
  {
    value: 'Persian_فارسی',
    label: t('language.Persian'),
    desc: 'فارسی',
  },
  {
    value: 'Thai_ภาษาไทย',
    label: t('language.Thai'),
    desc: 'ภาษาไทย',
  },
];
