export function StructuredData({ locale }: { locale: string }) {
  const organizationData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Shizue',
    url: 'https://shizue.ai',
    logo: 'https://shizue.ai/icons/icon-512x512.png',
    sameAs: [
      'https://twitter.com/shizue_ai',
      'https://github.com/shizue-ai',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@shizue.ai',
      contactType: 'customer support',
      availableLanguage: ['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de'],
    },
  }

  const softwareData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Shizue',
    applicationCategory: 'BrowserApplication',
    applicationSubCategory: 'Productivity',
    operatingSystem: 'Chrome, Edge, Firefox, Safari',
    softwareVersion: '1.0.0',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '1250',
      bestRating: '5',
      worstRating: '1',
    },
    url: `https://shizue.ai/${locale}`,
    description: 'AI-powered browser extension for translation, chat, and web browsing with support for GPT-4, Claude, and Gemini',
    screenshot: [
      'https://shizue.ai/images/hero/shizue-interface.png',
      'https://shizue.ai/images/screenshots/chat.png',
      'https://shizue.ai/images/screenshots/translation.png',
    ],
    featureList: [
      'Real-time translation with context preservation',
      'AI chat with GPT-4, Claude Sonnet, and Gemini Pro',
      'PDF translation maintaining original layout',
      'YouTube caption translation in real-time',
      'Smart context menu actions',
      'Multi-language support (23 languages)',
      'Privacy-focused with local API key storage',
    ],
    publisher: organizationData,
    datePublished: '2024-01-01',
    dateModified: new Date().toISOString(),
    license: 'https://opensource.org/licenses/MIT',
    inLanguage: [
      'ar', 'bn', 'de', 'en', 'es', 'fa', 'fil', 'fr',
      'hi', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'sw',
      'th', 'tr', 'ur', 'vi', 'zh'
    ],
    author: organizationData,
  }

  const webPageData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: `https://shizue.ai/${locale}`,
    name: 'Shizue - AI Browser Extension',
    description: 'Free, open-source browser extension that brings AI power to your browsing experience',
    inLanguage: locale,
    isPartOf: {
      '@type': 'WebSite',
      url: 'https://shizue.ai',
      name: 'Shizue',
      alternateName: 'Shizue AI Browser Extension',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          item: {
            '@id': 'https://shizue.ai',
            name: 'Home',
          },
        },
        {
          '@type': 'ListItem',
          position: 2,
          item: {
            '@id': `https://shizue.ai/${locale}`,
            name: locale.toUpperCase(),
          },
        },
      ],
    },
  }

  const faqData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is Shizue free to use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, Shizue is completely free and open-source. You just need to provide your own API keys for the AI services.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which AI models does Shizue support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Shizue supports GPT-4, GPT-3.5, Claude 3 Sonnet, Gemini Pro, and Gemini 1.5 Flash.',
        },
      },
      {
        '@type': 'Question',
        name: 'How secure is Shizue?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Shizue stores your API keys locally in your browser. They are never sent to our servers, ensuring complete privacy and security.',
        },
      },
    ],
  }

  const structuredData = [organizationData, softwareData, webPageData, faqData]

  return (
    <>
      {structuredData.map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  )
}
