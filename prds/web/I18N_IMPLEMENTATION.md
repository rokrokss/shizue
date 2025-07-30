# 다국어 지원 구현 상세 가이드

Shizue 웹 애플리케이션의 23개 언어 지원을 위한 완벽한 구현 가이드입니다.

## 개요

Shizue는 글로벌 사용자를 위해 23개 언어를 지원합니다. Next.js 15 App Router와 next-intl을 활용하여 효율적이고 SEO 친화적인 다국어 시스템을 구현합니다.

## 지원 언어 목록

| 코드 | 언어명 (Native) | 언어명 (English) | RTL |
|------|----------------|------------------|-----|
| ar | العربية | Arabic | ✓ |
| bn | বাংলা | Bengali | |
| de | Deutsch | German | |
| en | English | English | |
| es | Español | Spanish | |
| fa | فارسی | Persian | ✓ |
| fil | Filipino | Filipino | |
| fr | Français | French | |
| hi | हिन्दी | Hindi | |
| it | Italiano | Italian | |
| ja | 日本語 | Japanese | |
| ko | 한국어 | Korean | |
| pl | Polski | Polish | |
| pt-BR | Português (Brasil) | Portuguese (Brazil) | |
| pt-PT | Português (Portugal) | Portuguese (Portugal) | |
| ru | Русский | Russian | |
| sw | Kiswahili | Swahili | |
| th | ไทย | Thai | |
| tr | Türkçe | Turkish | |
| ur | اردو | Urdu | ✓ |
| vi | Tiếng Việt | Vietnamese | |
| zh-CN | 简体中文 | Chinese (Simplified) | |
| zh-TW | 繁體中文 | Chinese (Traditional) | |

## 아키텍처 설계

### URL 구조
```
https://shizue.ai/[locale]
├── https://shizue.ai/en (기본)
├── https://shizue.ai/ko
├── https://shizue.ai/ja
└── ... (23개 언어)
```

### 폴더 구조
```
webapp/
├── app/
│   └── [locale]/
│       ├── layout.tsx
│       ├── page.tsx
│       └── not-found.tsx
├── messages/
│   ├── ar.json
│   ├── bn.json
│   └── ... (23개 파일)
├── lib/
│   └── i18n/
│       ├── config.ts
│       ├── locales.ts
│       ├── request.ts
│       └── utils.ts
└── middleware.ts
```

## 단계별 구현

### 1. 기본 설정

#### 의존성 설치
```bash
pnpm add next-intl
pnpm add -D @types/negotiator negotiator
```

#### 타입 정의
`types/i18n.d.ts`:
```typescript
export type Locale = 
  | 'ar' | 'bn' | 'de' | 'en' | 'es' | 'fa' | 'fil' | 'fr' 
  | 'hi' | 'it' | 'ja' | 'ko' | 'pl' | 'pt-BR' | 'pt-PT' 
  | 'ru' | 'sw' | 'th' | 'tr' | 'ur' | 'vi' | 'zh-CN' | 'zh-TW'

export interface LocaleConfig {
  code: Locale
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
  flag: string
  region?: string
}
```

### 2. 로케일 설정

`lib/i18n/locales.ts`:
```typescript
import { LocaleConfig } from '@/types/i18n'

export const locales = [
  'ar', 'bn', 'de', 'en', 'es', 'fa', 'fil', 'fr', 
  'hi', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'pt-PT', 
  'ru', 'sw', 'th', 'tr', 'ur', 'vi', 'zh-CN', 'zh-TW'
] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeConfigs: Record<Locale, LocaleConfig> = {
  'ar': {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
    flag: '🇸🇦',
    region: 'SA'
  },
  'bn': {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    dir: 'ltr',
    flag: '🇧🇩',
    region: 'BD'
  },
  'de': {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    dir: 'ltr',
    flag: '🇩🇪',
    region: 'DE'
  },
  'en': {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dir: 'ltr',
    flag: '🇺🇸',
    region: 'US'
  },
  'es': {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    dir: 'ltr',
    flag: '🇪🇸',
    region: 'ES'
  },
  'fa': {
    code: 'fa',
    name: 'Persian',
    nativeName: 'فارسی',
    dir: 'rtl',
    flag: '🇮🇷',
    region: 'IR'
  },
  'fil': {
    code: 'fil',
    name: 'Filipino',
    nativeName: 'Filipino',
    dir: 'ltr',
    flag: '🇵🇭',
    region: 'PH'
  },
  'fr': {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    dir: 'ltr',
    flag: '🇫🇷',
    region: 'FR'
  },
  'hi': {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    dir: 'ltr',
    flag: '🇮🇳',
    region: 'IN'
  },
  'it': {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    dir: 'ltr',
    flag: '🇮🇹',
    region: 'IT'
  },
  'ja': {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    dir: 'ltr',
    flag: '🇯🇵',
    region: 'JP'
  },
  'ko': {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    dir: 'ltr',
    flag: '🇰🇷',
    region: 'KR'
  },
  'pl': {
    code: 'pl',
    name: 'Polish',
    nativeName: 'Polski',
    dir: 'ltr',
    flag: '🇵🇱',
    region: 'PL'
  },
  'pt-BR': {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    dir: 'ltr',
    flag: '🇧🇷',
    region: 'BR'
  },
  'pt-PT': {
    code: 'pt-PT',
    name: 'Portuguese (Portugal)',
    nativeName: 'Português (Portugal)',
    dir: 'ltr',
    flag: '🇵🇹',
    region: 'PT'
  },
  'ru': {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    dir: 'ltr',
    flag: '🇷🇺',
    region: 'RU'
  },
  'sw': {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    dir: 'ltr',
    flag: '🇰🇪',
    region: 'KE'
  },
  'th': {
    code: 'th',
    name: 'Thai',
    nativeName: 'ไทย',
    dir: 'ltr',
    flag: '🇹🇭',
    region: 'TH'
  },
  'tr': {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    dir: 'ltr',
    flag: '🇹🇷',
    region: 'TR'
  },
  'ur': {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    dir: 'rtl',
    flag: '🇵🇰',
    region: 'PK'
  },
  'vi': {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    dir: 'ltr',
    flag: '🇻🇳',
    region: 'VN'
  },
  'zh-CN': {
    code: 'zh-CN',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    dir: 'ltr',
    flag: '🇨🇳',
    region: 'CN'
  },
  'zh-TW': {
    code: 'zh-TW',
    name: 'Chinese (Traditional)',
    nativeName: '繁體中文',
    dir: 'ltr',
    flag: '🇹🇼',
    region: 'TW'
  }
}
```

### 3. 미들웨어 구현

`middleware.ts`:
```typescript
import { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from '@/lib/i18n/locales'
import negotiator from 'negotiator'

// 사용자 선호 언어 감지
function getPreferredLocale(request: NextRequest): string {
  // 1. 쿠키에서 저장된 언어 확인
  const cookieLocale = request.cookies.get('locale')?.value
  if (cookieLocale && locales.includes(cookieLocale as any)) {
    return cookieLocale
  }

  // 2. Accept-Language 헤더 분석
  const acceptLanguage = request.headers.get('accept-language') || ''
  const languages = new negotiator.Negotiator({
    headers: { 'accept-language': acceptLanguage }
  }).languages()

  // 3. 지원 언어와 매칭
  for (const lang of languages) {
    // 정확한 매치
    if (locales.includes(lang as any)) {
      return lang
    }
    // 언어 코드만 매치 (예: zh-CN -> zh)
    const langCode = lang.split('-')[0]
    const match = locales.find(locale => locale.startsWith(langCode))
    if (match) {
      return match
    }
  }

  // 4. IP 기반 지역 감지 (Vercel Edge)
  const country = request.geo?.country
  if (country) {
    const countryLocaleMap: Record<string, string> = {
      'US': 'en', 'GB': 'en', 'AU': 'en', 'CA': 'en',
      'DE': 'de', 'AT': 'de', 'CH': 'de',
      'FR': 'fr', 'BE': 'fr',
      'ES': 'es', 'MX': 'es', 'AR': 'es',
      'IT': 'it',
      'JP': 'ja',
      'KR': 'ko',
      'CN': 'zh-CN',
      'TW': 'zh-TW',
      'BR': 'pt-BR',
      'PT': 'pt-PT',
      'RU': 'ru',
      'SA': 'ar', 'AE': 'ar', 'EG': 'ar',
      'IR': 'fa',
      'IN': 'hi', 'BD': 'bn',
      'PH': 'fil',
      'PL': 'pl',
      'TH': 'th',
      'TR': 'tr',
      'PK': 'ur',
      'VN': 'vi',
      'KE': 'sw', 'TZ': 'sw'
    }
    const mappedLocale = countryLocaleMap[country]
    if (mappedLocale && locales.includes(mappedLocale as any)) {
      return mappedLocale
    }
  }

  return defaultLocale
}

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: false // 수동 감지 사용
})

export default function middleware(request: NextRequest) {
  // 정적 파일 제외
  if (request.nextUrl.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)$/)) {
    return
  }

  // API 라우트 제외
  if (request.nextUrl.pathname.startsWith('/api')) {
    return
  }

  // 로케일이 없는 경우 감지된 언어로 리다이렉트
  const pathname = request.nextUrl.pathname
  const pathnameHasLocale = locales.some(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (!pathnameHasLocale) {
    const locale = getPreferredLocale(request)
    request.nextUrl.pathname = `/${locale}${pathname}`
    const response = intlMiddleware(request)
    response?.cookies.set('locale', locale, { maxAge: 365 * 24 * 60 * 60 })
    return response
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/((?!_next|_vercel|.*\\..*).*)']
}
```

### 4. 번역 파일 구조

#### 기본 구조
`messages/[locale].json`:
```json
{
  "metadata": {
    "title": "...",
    "description": "...",
    "keywords": ["..."],
    "og": {
      "title": "...",
      "description": "..."
    }
  },
  "common": {
    "loading": "...",
    "error": "...",
    "retry": "...",
    "close": "...",
    "save": "...",
    "cancel": "..."
  },
  "navigation": {
    "home": "...",
    "features": "...",
    "pricing": "...",
    "download": "...",
    "docs": "...",
    "blog": "...",
    "support": "..."
  },
  "sections": {
    "hero": {...},
    "features": {...},
    "pricing": {...},
    "faq": {...}
  }
}
```

#### 언어별 특수 고려사항

**RTL 언어 (Arabic, Persian, Urdu)**:
```json
{
  "dir": "rtl",
  "font": "Noto Sans Arabic",
  "numberFormat": "arabic-indic"
}
```

**CJK 언어 (Chinese, Japanese, Korean)**:
```json
{
  "font": {
    "ja": "Noto Sans JP",
    "ko": "Noto Sans KR",
    "zh-CN": "Noto Sans SC",
    "zh-TW": "Noto Sans TC"
  },
  "wordBreak": "keep-all"
}
```

### 5. 레이아웃에서 RTL 지원

`app/[locale]/layout.tsx`:
```typescript
import { notFound } from 'next/navigation'
import { locales, localeConfigs } from '@/lib/i18n/locales'
import { getMessages } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { Noto_Sans_Arabic, Noto_Sans_JP, Noto_Sans_KR } from 'next/font/google'
import '@/styles/globals.css'

// 폰트 설정
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '700'],
  variable: '--font-arabic'
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-japanese'
})

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-korean'
})

// 언어별 폰트 매핑
const fontMap = {
  'ar': notoSansArabic,
  'fa': notoSansArabic,
  'ur': notoSansArabic,
  'ja': notoSansJP,
  'ko': notoSansKR,
}

export default async function RootLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!locales.includes(locale as any)) {
    notFound()
  }

  const messages = await getMessages(locale)
  const localeConfig = localeConfigs[locale as keyof typeof localeConfigs]
  const font = fontMap[locale as keyof typeof fontMap]

  return (
    <html 
      lang={locale} 
      dir={localeConfig.dir}
      className={font?.variable}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

### 6. 언어 전환 컴포넌트

`components/layout/LanguageSelector.tsx`:
```typescript
'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { localeConfigs } from '@/lib/i18n/locales'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Globe, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LanguageSelector() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)

  const currentLocale = localeConfigs[locale as keyof typeof localeConfigs]

  const handleLocaleChange = (newLocale: string) => {
    startTransition(() => {
      // 현재 경로에서 로케일 부분을 새 로케일로 교체
      const segments = pathname.split('/')
      segments[1] = newLocale
      const newPathname = segments.join('/')
      
      // 쿠키에 선택한 언어 저장
      document.cookie = `locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60}`
      
      router.push(newPathname)
      setIsOpen(false)
    })
  }

  // 지역별로 언어 그룹화
  const languageGroups = {
    'Europe': ['en', 'de', 'fr', 'es', 'it', 'pl', 'ru', 'tr'],
    'Asia': ['ja', 'ko', 'zh-CN', 'zh-TW', 'hi', 'bn', 'th', 'vi', 'fil'],
    'Middle East': ['ar', 'fa', 'ur'],
    'Americas': ['pt-BR', 'pt-PT'],
    'Africa': ['sw']
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          disabled={isPending}
          className={cn(
            "gap-2",
            currentLocale.dir === 'rtl' && "flex-row-reverse"
          )}
        >
          <Globe className="h-4 w-4" />
          <span>{currentLocale.flag}</span>
          <span className="hidden sm:inline">{currentLocale.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={currentLocale.dir === 'rtl' ? 'start' : 'end'}
        className="w-[300px] max-h-[60vh] overflow-y-auto"
      >
        {Object.entries(languageGroups).map(([region, locales]) => (
          <div key={region}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {region}
            </DropdownMenuLabel>
            {locales.map((loc) => {
              const config = localeConfigs[loc as keyof typeof localeConfigs]
              const isActive = locale === loc
              
              return (
                <DropdownMenuItem
                  key={loc}
                  onClick={() => handleLocaleChange(loc)}
                  className={cn(
                    "flex items-center justify-between",
                    config.dir === 'rtl' && "flex-row-reverse"
                  )}
                >
                  <div className={cn(
                    "flex items-center gap-2",
                    config.dir === 'rtl' && "flex-row-reverse"
                  )}>
                    <span>{config.flag}</span>
                    <span>{config.nativeName}</span>
                    {config.name !== config.nativeName && (
                      <span className="text-xs text-muted-foreground">
                        ({config.name})
                      </span>
                    )}
                  </div>
                  {isActive && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### 7. SEO 최적화

`app/[locale]/page.tsx`:
```typescript
import { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { locales, localeConfigs } from '@/lib/i18n/locales'

type Props = {
  params: { locale: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale: params.locale, namespace: 'metadata' })
  const config = localeConfigs[params.locale as keyof typeof localeConfigs]

  // 대체 언어 링크 생성
  const languages = Object.fromEntries(
    locales.map(l => {
      const langConfig = localeConfigs[l]
      return [langConfig.region || l, `/${l}`]
    })
  )

  return {
    title: t('title'),
    description: t('description'),
    keywords: t.raw('keywords'),
    authors: [{ name: 'Shizue Team' }],
    creator: 'Shizue',
    publisher: 'Shizue',
    metadataBase: new URL('https://shizue.ai'),
    alternates: {
      canonical: `/${params.locale}`,
      languages
    },
    openGraph: {
      title: t('og.title'),
      description: t('og.description'),
      url: `https://shizue.ai/${params.locale}`,
      siteName: 'Shizue',
      images: [
        {
          url: `/og/${params.locale}.png`,
          width: 1200,
          height: 630,
          alt: t('og.imageAlt'),
        }
      ],
      locale: params.locale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('og.title'),
      description: t('og.description'),
      images: [`/og/${params.locale}.png`],
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
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
      yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
      yahoo: process.env.NEXT_PUBLIC_YAHOO_VERIFICATION,
    },
  }
}
```

### 8. 성능 최적화

#### 번역 파일 분할
`lib/i18n/loader.ts`:
```typescript
import { cache } from 'react'

// 네임스페이스별 번역 로딩
export const loadTranslations = cache(async (locale: string, namespaces: string[]) => {
  const translations: Record<string, any> = {}
  
  for (const namespace of namespaces) {
    try {
      const module = await import(`@/messages/${locale}/${namespace}.json`)
      translations[namespace] = module.default
    } catch (error) {
      console.warn(`Translation not found: ${locale}/${namespace}`)
      // 기본 언어로 폴백
      try {
        const fallback = await import(`@/messages/en/${namespace}.json`)
        translations[namespace] = fallback.default
      } catch {
        translations[namespace] = {}
      }
    }
  }
  
  return translations
})
```

#### 동적 임포트 최적화
```typescript
// 언어별 날짜 포맷터 동적 로딩
const getDateFormatter = async (locale: string) => {
  switch (locale) {
    case 'ar':
    case 'fa':
      const { formatArabicDate } = await import('@/lib/i18n/formatters/arabic')
      return formatArabicDate
    case 'ja':
      const { formatJapaneseDate } = await import('@/lib/i18n/formatters/japanese')
      return formatJapaneseDate
    default:
      const { formatDefaultDate } = await import('@/lib/i18n/formatters/default')
      return formatDefaultDate
  }
}
```

### 9. 테스트

#### i18n 유닛 테스트
`__tests__/i18n/locales.test.ts`:
```typescript
import { locales, localeConfigs } from '@/lib/i18n/locales'
import fs from 'fs/promises'
import path from 'path'

describe('i18n Configuration', () => {
  test('all locales have config entries', () => {
    locales.forEach(locale => {
      expect(localeConfigs[locale]).toBeDefined()
      expect(localeConfigs[locale].code).toBe(locale)
      expect(localeConfigs[locale].name).toBeTruthy()
      expect(localeConfigs[locale].nativeName).toBeTruthy()
      expect(['ltr', 'rtl']).toContain(localeConfigs[locale].dir)
    })
  })

  test('all locales have translation files', async () => {
    const messagesDir = path.join(process.cwd(), 'messages')
    
    for (const locale of locales) {
      const filePath = path.join(messagesDir, `${locale}.json`)
      const exists = await fs.access(filePath).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    }
  })

  test('translation files have required keys', async () => {
    const requiredKeys = ['metadata.title', 'metadata.description', 'hero.title']
    
    for (const locale of locales) {
      const filePath = path.join(process.cwd(), 'messages', `${locale}.json`)
      const content = await fs.readFile(filePath, 'utf-8')
      const translations = JSON.parse(content)
      
      requiredKeys.forEach(key => {
        const value = key.split('.').reduce((obj, k) => obj?.[k], translations)
        expect(value).toBeTruthy()
      })
    }
  })
})
```

#### E2E 언어 전환 테스트
`e2e/i18n.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'
import { locales, localeConfigs } from '@/lib/i18n/locales'

test.describe('Internationalization', () => {
  test('redirects to preferred language', async ({ page, context }) => {
    // 브라우저 언어 설정
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'language', {
        value: 'ko-KR'
      })
    })
    
    await page.goto('/')
    await expect(page).toHaveURL('/ko')
  })

  test('language selector works', async ({ page }) => {
    await page.goto('/en')
    
    // 언어 선택기 열기
    await page.click('button:has-text("English")')
    
    // 한국어 선택
    await page.click('text=한국어')
    
    // URL과 콘텐츠 확인
    await expect(page).toHaveURL('/ko')
    await expect(page.locator('h1')).toContainText('AI로 번역하고')
  })

  test('preserves path on language change', async ({ page }) => {
    await page.goto('/en#features')
    
    await page.click('button:has-text("English")')
    await page.click('text=日本語')
    
    await expect(page).toHaveURL('/ja#features')
  })

  test('RTL languages display correctly', async ({ page }) => {
    await page.goto('/ar')
    
    const html = page.locator('html')
    await expect(html).toHaveAttribute('dir', 'rtl')
    
    // RTL 레이아웃 확인
    const header = page.locator('header')
    await expect(header).toHaveCSS('direction', 'rtl')
  })
})
```

## 번역 워크플로우

### 1. 번역 키 추출
```bash
# 스크립트: scripts/extract-keys.ts
pnpm tsx scripts/extract-keys.ts
```

### 2. 번역 검증
```bash
# 스크립트: scripts/validate-translations.ts
pnpm tsx scripts/validate-translations.ts
```

### 3. 번역 상태 대시보드
```typescript
// scripts/translation-status.ts
import { locales } from '@/lib/i18n/locales'
import fs from 'fs/promises'
import path from 'path'

async function checkTranslationStatus() {
  const baseMessages = await import('@/messages/en.json')
  const baseKeys = extractKeys(baseMessages.default)
  
  const status: Record<string, number> = {}
  
  for (const locale of locales) {
    if (locale === 'en') continue
    
    try {
      const messages = await import(`@/messages/${locale}.json`)
      const keys = extractKeys(messages.default)
      const coverage = (keys.size / baseKeys.size) * 100
      status[locale] = Math.round(coverage)
    } catch {
      status[locale] = 0
    }
  }
  
  console.table(status)
}

function extractKeys(obj: any, prefix = ''): Set<string> {
  const keys = new Set<string>()
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    
    if (typeof value === 'object' && value !== null) {
      const nestedKeys = extractKeys(value, fullKey)
      nestedKeys.forEach(k => keys.add(k))
    } else {
      keys.add(fullKey)
    }
  }
  
  return keys
}
```

## 모범 사례

### 1. 번역 키 네이밍
```
- 계층적 구조 사용: section.component.element
- 의미있는 이름 사용: hero.title (O), text1 (X)
- 일관된 네이밍 규칙: camelCase 사용
```

### 2. 동적 콘텐츠
```typescript
// 올바른 예
t('welcome', { name: userName })

// messages/en.json
{
  "welcome": "Welcome, {name}!"
}
```

### 3. 복수형 처리
```typescript
// 올바른 예
t('items', { count: itemCount })

// messages/en.json
{
  "items": "{count, plural, =0 {No items} =1 {One item} other {# items}}"
}
```

### 4. 날짜/시간 포맷
```typescript
import { format } from 'date-fns'
import { enUS, ko, ja, zhCN } from 'date-fns/locale'

const dateLocales = {
  'en': enUS,
  'ko': ko,
  'ja': ja,
  'zh-CN': zhCN,
  // ...
}

export function formatDate(date: Date, locale: string) {
  return format(date, 'PPP', {
    locale: dateLocales[locale] || enUS
  })
}
```

### 5. 숫자 포맷
```typescript
export function formatNumber(num: number, locale: string) {
  return new Intl.NumberFormat(locale).format(num)
}

export function formatCurrency(amount: number, locale: string, currency = 'USD') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount)
}
```

## 문제 해결

### 일반적인 문제

1. **하이드레이션 에러**
   - 서버와 클라이언트의 locale 불일치
   - 해결: middleware에서 쿠키 설정 확인

2. **번역 키 누락**
   - 개발 중 새 키 추가 시 다른 언어 파일 업데이트 누락
   - 해결: 번역 검증 스크립트 실행

3. **RTL 레이아웃 깨짐**
   - CSS에서 방향 고려 누락
   - 해결: logical properties 사용 (margin-left → margin-inline-start)

4. **폰트 로딩 지연**
   - 언어별 폰트가 늦게 로드됨
   - 해결: 폰트 preload, subset 최적화

## 체크리스트

- [ ] 23개 언어 번역 파일 생성
- [ ] RTL 언어 레이아웃 테스트
- [ ] 언어 전환 기능 테스트
- [ ] SEO 메타데이터 검증
- [ ] 폰트 로딩 최적화
- [ ] 언어별 날짜/숫자 포맷 테스트
- [ ] 번역 커버리지 90% 이상
- [ ] 언어 감지 로직 테스트
- [ ] 성능 프로파일링 (각 언어)
- [ ] 접근성 테스트 (각 언어)