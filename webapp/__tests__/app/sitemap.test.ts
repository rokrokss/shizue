/// <reference types="jest" />
import sitemap from '@/app/sitemap'
import { locales } from '@/lib/i18n/locales'
import { MetadataRoute } from 'next'

describe('Sitemap Generation', () => {
  it('generates sitemap with all locales', () => {
    const sitemapData = sitemap()

    // Check that sitemap is an array
    expect(Array.isArray(sitemapData)).toBe(true)

    // Check root URL
    const rootUrl = sitemapData.find((item: MetadataRoute.Sitemap[number]) => item.url === 'https://shizue.ai')
    expect(rootUrl).toBeDefined()
    expect(rootUrl?.priority).toBe(1)
    expect(rootUrl?.changeFrequency).toBe('monthly')

    // Check all locale URLs
    locales.forEach((locale: string) => {
      const localeUrl = sitemapData.find((item: MetadataRoute.Sitemap[number]) => item.url === `https://shizue.ai/${locale}`)
      expect(localeUrl).toBeDefined()
      expect(localeUrl?.changeFrequency).toBe('monthly')
      expect(localeUrl?.priority).toBe(locale === 'en' ? 1 : 0.8)
    })
  })

  it('generates URLs for static pages in all locales', () => {
    const sitemapData = sitemap()
    const staticPages = ['/privacy', '/terms']

    staticPages.forEach((page: string) => {
      locales.forEach((locale: string) => {
        const pageUrl = sitemapData.find((item: MetadataRoute.Sitemap[number]) =>
          item.url === `https://shizue.ai/${locale}${page}`
        )
        expect(pageUrl).toBeDefined()
        expect(pageUrl?.changeFrequency).toBe('yearly')
        expect(pageUrl?.priority).toBe(0.5)
      })
    })
  })

  it('sets correct lastModified dates', () => {
    const sitemapData = sitemap()

    sitemapData.forEach((item: MetadataRoute.Sitemap[number]) => {
      expect(item.lastModified).toBeInstanceOf(Date)
      // Check that date is recent (within last minute for test)
      if (item.lastModified instanceof Date) {
        const now = new Date()
        const diff = now.getTime() - item.lastModified.getTime()
        expect(diff).toBeLessThan(60000) // Less than 1 minute
      }
    })
  })

  it('generates correct total number of URLs', () => {
    const sitemapData = sitemap()

    // 1 root URL
    // 23 locale home pages
    // 23 * 4 static pages (privacy, terms, contact, blog)
    const expectedCount = 1 + 23 + (23 * 4)

    expect(sitemapData).toHaveLength(expectedCount)
  })

  it('uses correct base URL', () => {
    const sitemapData = sitemap()

    sitemapData.forEach((item: MetadataRoute.Sitemap[number]) => {
      expect(item.url).toMatch(/^https:\/\/shizue\.ai/)
    })
  })

  it('has valid changeFrequency values', () => {
    const sitemapData = sitemap()
    const validFrequencies = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']

    sitemapData.forEach((item: MetadataRoute.Sitemap[number]) => {
      expect(validFrequencies).toContain(item.changeFrequency)
    })
  })

  it('has valid priority values', () => {
    const sitemapData = sitemap()

    sitemapData.forEach((item: MetadataRoute.Sitemap[number]) => {
      expect(item.priority).toBeGreaterThanOrEqual(0)
      expect(item.priority).toBeLessThanOrEqual(1)
    })
  })
})
