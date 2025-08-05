import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { LanguageSelector } from './LanguageSelector'

export function Footer() {
  const t = useTranslations('footer')
  const locale = useLocale()

  return (
    <footer className="border-t py-6 md:py-12">
      <div className="container grid grid-cols-2 gap-8 md:grid-cols-4">
        <div>
          <h3 className="text-sm font-semibold">{t('product')}</h3>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground">
                {t('links.features')}
              </Link>
            </li>
            <li>
              <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
                {t('links.pricing')}
              </Link>
            </li>
            <li>
              <Link href="https://chrome.google.com/webstore/detail/shizue" className="text-sm text-muted-foreground hover:text-foreground" target="_blank">
                {t('links.download')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t('resources')}</h3>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href="#" className="text-sm text-muted-foreground hover:text-foreground">
                {t('links.documentation')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/blog`} className="text-sm text-muted-foreground hover:text-foreground">
                {t('links.blog')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/contact`} className="text-sm text-muted-foreground hover:text-foreground">
                {t('links.contact')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t('community')}</h3>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href="https://github.com/shizue" className="text-sm text-muted-foreground hover:text-foreground" target="_blank">
                {t('links.github')}
              </Link>
            </li>
            <li>
              <Link href="https://discord.gg/shizue" className="text-sm text-muted-foreground hover:text-foreground" target="_blank">
                {t('links.discord')}
              </Link>
            </li>
            <li>
              <Link href="https://twitter.com/shizue_ai" className="text-sm text-muted-foreground hover:text-foreground" target="_blank">
                {t('links.twitter')}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t('legal')}</h3>
          <ul className="mt-4 space-y-2">
            <li>
              <Link href={`/${locale}/privacy`} className="text-sm text-muted-foreground hover:text-foreground">
                {t('links.privacy')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/terms`} className="text-sm text-muted-foreground hover:text-foreground">
                {t('links.terms')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="container mt-8 flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
        <p className="text-sm text-muted-foreground">
          © 2024 Shizue. All rights reserved.
        </p>
        <div className="flex items-center space-x-4">
          <LanguageSelector />
        </div>
      </div>
    </footer>
  )
}