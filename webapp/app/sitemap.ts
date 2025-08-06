import { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n/locales';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://shizue.ai';

  // Generate URLs for all locales
  const localeUrls = locales.map((locale) => ({
    url: `${baseUrl}/${locale}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: locale === 'en' ? 1 : 0.8,
  }));

  // Add root URL that redirects to default locale
  const urls: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    ...localeUrls,
  ];

  // Add static pages for each locale
  const staticPages = ['/privacy', '/terms', '/contact', '/blog'];
  staticPages.forEach((page) => {
    locales.forEach((locale) => {
      urls.push({
        url: `${baseUrl}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: page === '/blog' ? 'weekly' : 'yearly',
        priority: page === '/blog' ? 0.7 : 0.5,
      });
    });
  });

  return urls;
}
