import React from 'react';
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

// Mock messages
const messages = {
  metadata: {
    title: 'Shizue - Free AI Browser Extension',
    description: 'Enhance your browsing with AI power.',
  },
  header: {
    features: 'Features',
    pricing: 'Pricing',
    download: 'Download',
    docs: 'Documentation',
    community: 'Community',
  },
  hero: {
    title: 'Translate, Chat, and Browse with AI Power',
    subtitle: 'Free open-source Chrome extension',
    cta: {
      chrome: 'Add to Chrome',
      edge: 'Add to Edge',
    },
    badges: {
      free: 'Free',
      openSource: 'Open Source',
      privacy: 'Privacy Protected',
    },
    imageAlt:
      'Shizue browser extension interface showing AI chat, translation features, and bilingual web browsing capabilities',
  },
  features: {
    badge: 'AI-Powered Features',
    title: 'Everything You Need',
    subtitle: 'Powerful tools to enhance your web experience',
    items: {
      translation: {
        title: 'Bilingual Web Translation',
        description: 'Side-by-side translation',
      },
      chat: {
        title: 'AI Chat Sidebar',
        description: 'Chat with AI while browsing',
      },
      pdf: {
        title: 'PDF Document Translation',
        description: 'Translate PDFs',
      },
      youtube: {
        title: 'YouTube Caption Translation',
        description: 'Real-time subtitle translation',
      },
      ocr: {
        title: 'Image Text Extraction',
        description: 'Extract text from images',
      },
      notes: {
        title: 'Smart Notes',
        description: 'Take notes while browsing',
      },
    },
  },
  footer: {
    product: 'Product',
    resources: 'Resources',
    community: 'Community',
    legal: 'Legal',
    links: {
      features: 'Features',
      pricing: 'Pricing',
      download: 'Download',
      documentation: 'Documentation',
      blog: 'Blog',
      github: 'GitHub',
      discord: 'Discord',
      twitter: 'Twitter',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
    },
  },
};

export function renderWithIntl(ui: React.ReactElement, { locale = 'en', ...renderOptions } = {}) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Re-export everything
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
