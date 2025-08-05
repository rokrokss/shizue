import { locales, localeNames } from '@/lib/i18n/locales'

describe('i18n locales configuration', () => {
  it('has 23 supported locales', () => {
    expect(locales).toHaveLength(23)
  })

  it('includes all expected locales', () => {
    const expectedLocales = [
      'ar', 'bn', 'de', 'en', 'es', 'fa', 'fil', 'fr',
      'hi', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'pt-PT',
      'ru', 'sw', 'th', 'tr', 'ur', 'vi', 'zh-CN', 'zh-TW'
    ]

    expectedLocales.forEach(locale => {
      expect(locales).toContain(locale)
    })
  })

  it('has locale names for all supported locales', () => {
    locales.forEach(locale => {
      expect(localeNames[locale]).toBeDefined()
      expect(typeof localeNames[locale]).toBe('string')
      expect(localeNames[locale].length).toBeGreaterThan(0)
    })
  })

  it('has correct native language names', () => {
    expect(localeNames['en']).toBe('English')
    expect(localeNames['ko']).toBe('한국어')
    expect(localeNames['ja']).toBe('日本語')
    expect(localeNames['zh-CN']).toBe('简体中文')
    expect(localeNames['zh-TW']).toBe('繁體中文')
    expect(localeNames['ar']).toBe('العربية')
    expect(localeNames['hi']).toBe('हिन्दी')
    expect(localeNames['ru']).toBe('Русский')
  })

  it('maintains consistent locale order', () => {
    const sortedLocales = [...locales].sort()
    expect(locales).toEqual(sortedLocales)
  })

  it('uses correct locale format', () => {
    locales.forEach(locale => {
      // Check locale format (xx, xxx, or xx-XX)
      expect(locale).toMatch(/^[a-z]{2,3}(-[A-Z]{2})?$/)
    })
  })

  it('has unique locale codes', () => {
    const uniqueLocales = new Set(locales)
    expect(uniqueLocales.size).toBe(locales.length)
  })
})