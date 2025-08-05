import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { locales, type Locale } from '@/lib/i18n/locales'
import { StructuredData } from '@/components/common/StructuredData'
import '@/styles/globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  adjustFontFallback: true,
})

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const messages = await getMessages()
  
  // Type guard to ensure messages is an object
  if (typeof messages === 'string' || !messages) {
    notFound()
  }
  
  const metadata = messages.metadata as { title: string; description: string }
  
  return {
    title: metadata.title,
    description: metadata.description,
    metadataBase: new URL('https://shizue.ai'),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        locales.map(l => [l, `/${l}`])
      )
    },
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      url: `https://shizue.ai/${locale}`,
      siteName: 'Shizue',
      images: [
        {
          url: `/og-${locale}.png`,
          width: 1200,
          height: 630,
          alt: 'Shizue - AI Browser Extension',
        }
      ],
      locale: locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: metadata.title,
      description: metadata.description,
      images: [`/og-${locale}.png`],
      creator: '@shizue_ai',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/icons/icon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: [
        { url: '/icons/apple-icon-180x180.png' },
      ],
    },
  }
}

export default async function RootLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <html lang={locale} className={inter.variable}>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <StructuredData locale={locale} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}