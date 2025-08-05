'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { LanguageSelector } from './LanguageSelector'
import { Chrome } from 'lucide-react'

export function Header() {
  const t = useTranslations('header')
  const locale = useLocale()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <div className="mr-4 flex">
          <Link href={`/${locale}`} className="mr-6 flex items-center space-x-2">
            <span className="font-bold text-xl">Shizue</span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href={`/${locale}#features`}
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              {t('features')}
            </Link>
            <Link
              href={`/${locale}#pricing`}
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              {t('pricing')}
            </Link>
            <Link
              href={`/${locale}#docs`}
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              {t('docs')}
            </Link>
            <Link
              href={`/${locale}/blog`}
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              {t('blog')}
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              {t('contact')}
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <LanguageSelector />
          </div>
          <nav className="flex items-center space-x-2">
            <Button asChild>
              <Link href="https://chrome.google.com/webstore/detail/shizue" target="_blank">
                <Chrome className="mr-2 h-4 w-4" />
                {t('download')}
              </Link>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}