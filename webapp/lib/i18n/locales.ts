export const locales = [
  'ar', 'bn', 'de', 'en', 'es', 'fa', 'fil', 'fr',
  'hi', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'pt-PT',
  'ru', 'sw', 'th', 'tr', 'ur', 'vi', 'zh-CN', 'zh-TW'
] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  'ar': 'العربية',
  'bn': 'বাংলা',
  'de': 'Deutsch',
  'en': 'English',
  'es': 'Español',
  'fa': 'فارسی',
  'fil': 'Filipino',
  'fr': 'Français',
  'hi': 'हिन्दी',
  'it': 'Italiano',
  'ja': '日本語',
  'ko': '한국어',
  'pl': 'Polski',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'ru': 'Русский',
  'sw': 'Kiswahili',
  'th': 'ไทย',
  'tr': 'Türkçe',
  'ur': 'اردو',
  'vi': 'Tiếng Việt',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文'
}
