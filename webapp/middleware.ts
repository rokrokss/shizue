import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from '@/lib/i18n/locales'

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always'
})

export const config = {
  matcher: ['/', '/(ar|bn|de|en|es|fa|fil|fr|hi|it|ja|ko|pl|pt-BR|pt-PT|ru|sw|th|tr|ur|vi|zh-CN|zh-TW)/:path*']
}