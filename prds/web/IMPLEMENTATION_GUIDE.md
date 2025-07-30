# Shizue 웹 애플리케이션 구현 가이드

이 가이드는 Shizue 홍보 웹사이트를 처음부터 구현하는 개발자를 위한 단계별 지침서입니다.

## 빠른 시작

### 사전 요구사항
- Node.js 20.0.0 이상
- pnpm 9.0.0 이상
- Git

### 프로젝트 생성
```bash
# Next.js 프로젝트 생성
pnpm create next-app@latest webapp --typescript --tailwind --app --src-dir=false --import-alias="@/*"

# 프로젝트 디렉토리로 이동
cd webapp

# 추가 의존성 설치
pnpm add @shadcn/ui next-intl framer-motion lucide-react
pnpm add -D @types/node
```

## Phase 1: 프로젝트 기초 설정 (Day 1-2)

### 1.1 프로젝트 구조 생성

```bash
# 디렉토리 구조 생성
mkdir -p app/[locale]
mkdir -p components/{ui,layout,sections,common}
mkdir -p lib/i18n
mkdir -p messages
mkdir -p public/{images,fonts,icons}
mkdir -p types
```

### 1.2 TypeScript 설정

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 1.3 Tailwind CSS v4 설정

`tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
```

### 1.4 shadcn/ui 초기화

```bash
# shadcn/ui CLI 설치 및 초기화
pnpm dlx shadcn-ui@latest init

# 필요한 컴포넌트 추가
pnpm dlx shadcn-ui@latest add button
pnpm dlx shadcn-ui@latest add card
pnpm dlx shadcn-ui@latest add dropdown-menu
pnpm dlx shadcn-ui@latest add navigation-menu
pnpm dlx shadcn-ui@latest add accordion
```

### 1.5 글로벌 스타일 설정

`styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## Phase 2: 다국어 지원 설정 (Day 2-3)

### 2.1 Next.js 설정 업데이트

`next.config.mjs`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'shizue.ai',
      },
    ],
  },
}

export default nextConfig
```

### 2.2 지원 언어 정의

`lib/i18n/locales.ts`:
```typescript
export const locales = [
  'ar', 'bn', 'de', 'en', 'es', 'fa', 'fil', 'fr', 
  'hi', 'it', 'ja', 'ko', 'pl', 'pt-BR', 'pt-PT', 
  'ru', 'sw', 'th', 'tr', 'ur', 'vi', 'zh-CN', 'zh-TW'
] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  'ar': 'العربية',
  'bn': 'বাংলা',
  'de': 'Deutsch',
  'en': 'English',
  'es': 'Español',
  'fa': 'فارسی',
  'fil': 'Filipino',
  'fr': 'Français',
  'hi': 'हिन्दी',
  'it': 'Italiano',
  'ja': '日本語',
  'ko': '한국어',
  'pl': 'Polski',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'ru': 'Русский',
  'sw': 'Kiswahili',
  'th': 'ไทย',
  'tr': 'Türkçe',
  'ur': 'اردو',
  'vi': 'Tiếng Việt',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文'
}
```

### 2.3 i18n 설정

`lib/i18n/config.ts`:
```typescript
import { notFound } from 'next/navigation'
import { getRequestConfig } from 'next-intl/server'
import { locales } from './locales'

export default getRequestConfig(async ({ locale }) => {
  if (!locales.includes(locale as any)) notFound()

  return {
    messages: (await import(`@/messages/${locale}.json`)).default
  }
})
```

### 2.4 미들웨어 설정

`middleware.ts`:
```typescript
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
```

### 2.5 번역 파일 구조

`messages/en.json`:
```json
{
  "metadata": {
    "title": "Shizue - Free AI Browser Extension",
    "description": "Enhance your browsing with AI power. Free, open-source, use your own API keys."
  },
  "header": {
    "features": "Features",
    "pricing": "Pricing",
    "download": "Download",
    "docs": "Documentation",
    "community": "Community"
  },
  "hero": {
    "title": "Translate, Chat, and Browse with AI Power",
    "subtitle": "Free open-source Chrome extension that lets you use your own API keys to save costs",
    "cta": {
      "chrome": "Add to Chrome",
      "edge": "Add to Edge",
      "firefox": "Coming to Firefox",
      "safari": "Coming to Safari"
    },
    "badges": {
      "free": "Free",
      "openSource": "Open Source",
      "privacy": "Privacy Protected"
    }
  },
  "features": {
    "title": "Everything You Need for AI-Enhanced Browsing",
    "bilingual": {
      "title": "Bilingual Web Translation",
      "description": "Side-by-side translation preserving layout",
      "languages": "23 languages supported"
    },
    "chat": {
      "title": "AI Chat Sidebar",
      "description": "Chat with AI while browsing",
      "models": "GPT-4.1, Claude, Gemini"
    },
    "pdf": {
      "title": "PDF Document Translation",
      "description": "Translate PDFs keeping structure intact",
      "format": "Layout preservation"
    },
    "youtube": {
      "title": "YouTube Caption Translation",
      "description": "Real-time subtitle translation",
      "cache": "Fast response with caching"
    },
    "image": {
      "title": "Image Text Extraction",
      "description": "Extract and translate text from images",
      "ocr": "OCR + AI translation"
    },
    "memo": {
      "title": "Smart Notes",
      "description": "Take notes while browsing",
      "sync": "Auto-save & search"
    }
  },
  "models": {
    "title": "Choose Your Favorite AI Models",
    "subtitle": "Use your own API keys - no middleman fees"
  },
  "howItWorks": {
    "title": "Get Started in 3 Simple Steps",
    "step1": {
      "title": "Install",
      "description": "Add from Chrome Web Store"
    },
    "step2": {
      "title": "Set API Key",
      "description": "Enter your OpenAI/Claude/Gemini key"
    },
    "step3": {
      "title": "Start Using",
      "description": "AI features on every webpage"
    }
  },
  "comparison": {
    "title": "Why Choose Shizue?",
    "price": "Price",
    "models": "Latest Models",
    "privacy": "Privacy",
    "source": "Source Code",
    "usage": "Usage Limits",
    "shizue": {
      "price": "$0 (Your own API)",
      "models": "All models available",
      "privacy": "100% Protected",
      "source": "Open Source",
      "usage": "No limits"
    },
    "competitor": {
      "price": "$10-30/month",
      "models": "Limited selection",
      "privacy": "Data goes through servers",
      "source": "Closed source",
      "usage": "Monthly limits"
    }
  },
  "testimonials": {
    "title": "What Users Are Saying"
  },
  "faq": {
    "title": "Frequently Asked Questions",
    "items": {
      "apiKey": {
        "question": "How do I get an API key?",
        "answer": "You can get API keys directly from OpenAI, Anthropic (Claude), or Google (Gemini) websites. Each provider offers their own pricing."
      },
      "cost": {
        "question": "How much do API keys cost?",
        "answer": "API costs vary by provider and usage. Typically, casual users spend $5-20/month, much less than subscription services."
      },
      "languages": {
        "question": "Which languages are supported?",
        "answer": "We support 23 languages including English, Spanish, French, German, Japanese, Korean, Chinese, and more."
      },
      "privacy": {
        "question": "Is my data safe?",
        "answer": "Yes! Your API keys are stored locally in your browser. Translations go directly to AI providers without passing through our servers."
      },
      "browsers": {
        "question": "Which browsers are supported?",
        "answer": "Currently Chrome and Edge. Firefox and Safari support coming soon."
      }
    }
  },
  "finalCta": {
    "title": "Start Using AI in Your Browser Today",
    "subtitle": "No credit card, no subscription, just your API keys",
    "button": "Add to Chrome - It's Free",
    "links": {
      "github": "View on GitHub",
      "discord": "Join Discord",
      "docs": "Read Documentation"
    }
  },
  "footer": {
    "product": "Product",
    "resources": "Resources",
    "community": "Community",
    "legal": "Legal",
    "links": {
      "features": "Features",
      "pricing": "Pricing",
      "download": "Download",
      "documentation": "Documentation",
      "blog": "Blog",
      "github": "GitHub",
      "discord": "Discord",
      "twitter": "Twitter",
      "privacy": "Privacy Policy",
      "terms": "Terms of Service"
    }
  }
}
```

## Phase 3: 레이아웃 및 컴포넌트 구현 (Day 3-5)

### 3.1 루트 레이아웃

`app/[locale]/layout.tsx`:
```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { locales } from '@/lib/i18n/locales'
import '@/styles/globals.css'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
})

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const messages = await getMessages(locale)
  
  return {
    title: messages.metadata.title as string,
    description: messages.metadata.description as string,
    metadataBase: new URL('https://shizue.ai'),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        locales.map(l => [l, `/${l}`])
      )
    },
    openGraph: {
      images: [`/og-${locale}.png`],
    },
  }
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

  return (
    <html lang={locale} className={inter.variable}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

### 3.2 헤더 컴포넌트

`components/layout/Header.tsx`:
```typescript
'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { LanguageSelector } from './LanguageSelector'

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
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link href={`/${locale}#features`} legacyBehavior passHref>
                  <NavigationMenuLink className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50">
                    {t('features')}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href={`/${locale}#pricing`} legacyBehavior passHref>
                  <NavigationMenuLink className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50">
                    {t('pricing')}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger>{t('download')}</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px]">
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="https://chrome.google.com/webstore/detail/shizue"
                          className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="text-sm font-medium leading-none">Chrome Web Store</div>
                          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                            Install for Chrome and Edge browsers
                          </p>
                        </a>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <LanguageSelector />
          </div>
          <nav className="flex items-center space-x-2">
            <Button asChild>
              <Link href="https://chrome.google.com/webstore/detail/shizue" target="_blank">
                {t('download')}
              </Link>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}
```

### 3.3 언어 선택기

`components/layout/LanguageSelector.tsx`:
```typescript
'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { locales, localeNames } from '@/lib/i18n/locales'
import { Globe } from 'lucide-react'

export function LanguageSelector() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  const handleLocaleChange = (newLocale: string) => {
    const newPathname = pathname.replace(`/${locale}`, `/${newLocale}`)
    router.push(newPathname)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Globe className="mr-2 h-4 w-4" />
          {localeNames[locale as keyof typeof localeNames]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[400px] overflow-y-auto">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleLocaleChange(loc)}
            className={locale === loc ? 'bg-accent' : ''}
          >
            {localeNames[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### 3.4 히어로 섹션

`components/sections/Hero.tsx`:
```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chrome, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import Image from 'next/image'

export function Hero() {
  const t = useTranslations('hero')

  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-6 flex justify-center gap-2">
            <Badge variant="secondary">{t('badges.free')}</Badge>
            <Badge variant="secondary">{t('badges.openSource')}</Badge>
            <Badge variant="secondary">{t('badges.privacy')}</Badge>
          </div>
          
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
            {t('title')}
          </h1>
          
          <p className="mb-10 text-lg text-muted-foreground sm:text-xl">
            {t('subtitle')}
          </p>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <a 
                href="https://chrome.google.com/webstore/detail/shizue" 
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center"
              >
                <Chrome className="mr-2 h-5 w-5" />
                {t('cta.chrome')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a 
                href="https://microsoftedge.microsoft.com/addons/detail/shizue" 
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('cta.edge')}
              </a>
            </Button>
          </div>
          
          <div className="mt-16">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative mx-auto max-w-5xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-3xl" />
              <Image
                src="/images/hero/shizue-interface.png"
                alt="Shizue Interface"
                width={1200}
                height={675}
                className="relative rounded-lg border shadow-2xl"
                priority
              />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
```

### 3.5 기능 카드 컴포넌트

`components/common/FeatureCard.tsx`:
```typescript
import { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  highlight?: string
}

export function FeatureCard({ icon: Icon, title, description, highlight }: FeatureCardProps) {
  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-lg">
      <CardHeader>
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {highlight && (
        <CardContent>
          <Badge variant="secondary" className="text-xs">
            {highlight}
          </Badge>
        </CardContent>
      )}
    </Card>
  )
}
```

## Phase 4: 페이지 구현 (Day 5-7)

### 4.1 메인 페이지

`app/[locale]/page.tsx`:
```typescript
import { Header } from '@/components/layout/Header'
import { Hero } from '@/components/sections/Hero'
import { Features } from '@/components/sections/Features'
import { AIModels } from '@/components/sections/AIModels'
import { HowItWorks } from '@/components/sections/HowItWorks'
import { Comparison } from '@/components/sections/Comparison'
import { Testimonials } from '@/components/sections/Testimonials'
import { FAQ } from '@/components/sections/FAQ'
import { FinalCTA } from '@/components/sections/FinalCTA'
import { Footer } from '@/components/layout/Footer'

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <AIModels />
        <HowItWorks />
        <Comparison />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
```

### 4.2 기능 섹션

`components/sections/Features.tsx`:
```typescript
'use client'

import { useTranslations } from 'next-intl'
import { Globe, MessageSquare, FileText, Youtube, Image, StickyNote } from 'lucide-react'
import { FeatureCard } from '@/components/common/FeatureCard'
import { motion } from 'framer-motion'

const features = [
  { key: 'bilingual', icon: Globe },
  { key: 'chat', icon: MessageSquare },
  { key: 'pdf', icon: FileText },
  { key: 'youtube', icon: Youtube },
  { key: 'image', icon: Image },
  { key: 'memo', icon: StickyNote },
]

export function Features() {
  const t = useTranslations('features')

  return (
    <section id="features" className="py-20 sm:py-32">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
        </div>
        
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <FeatureCard
                icon={feature.icon}
                title={t(`${feature.key}.title`)}
                description={t(`${feature.key}.description`)}
                highlight={t(`${feature.key}.${feature.key === 'bilingual' ? 'languages' : feature.key === 'chat' ? 'models' : feature.key === 'pdf' ? 'format' : feature.key === 'youtube' ? 'cache' : feature.key === 'image' ? 'ocr' : 'sync'}`)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

## Phase 5: 최적화 및 배포 (Day 8-10)

### 5.1 SEO 최적화

`app/sitemap.ts`:
```typescript
import { MetadataRoute } from 'next'
import { locales } from '@/lib/i18n/locales'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://shizue.ai'
  
  const routes = locales.flatMap(locale => [
    {
      url: `${baseUrl}/${locale}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 1,
    }
  ])
  
  return routes
}
```

`app/robots.ts`:
```typescript
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://shizue.ai/sitemap.xml',
  }
}
```

### 5.2 분석 도구 통합

`lib/analytics.ts`:
```typescript
export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID

export const pageview = (url: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', GA_TRACKING_ID, {
      page_path: url,
    })
  }
}

export const event = ({ action, category, label, value }: {
  action: string
  category: string
  label?: string
  value?: number
}) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    })
  }
}
```

### 5.3 성능 최적화

`next.config.mjs` 업데이트:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'shizue.ai',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizeCss: true,
  },
}

export default nextConfig
```

### 5.4 Vercel 배포 설정

`vercel.json`:
```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "functions": {
    "app/[locale]/page.tsx": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

## 테스트 가이드

### 유닛 테스트

`__tests__/components/FeatureCard.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { FeatureCard } from '@/components/common/FeatureCard'
import { Globe } from 'lucide-react'

describe('FeatureCard', () => {
  it('renders correctly', () => {
    render(
      <FeatureCard
        icon={Globe}
        title="Test Feature"
        description="Test description"
        highlight="Test highlight"
      />
    )
    
    expect(screen.getByText('Test Feature')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
    expect(screen.getByText('Test highlight')).toBeInTheDocument()
  })
})
```

### E2E 테스트

`e2e/homepage.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('should load and display hero section', async ({ page }) => {
    await page.goto('/')
    
    await expect(page.locator('h1')).toContainText('Translate, Chat, and Browse with AI Power')
    await expect(page.locator('text=Add to Chrome')).toBeVisible()
  })
  
  test('should change language', async ({ page }) => {
    await page.goto('/')
    
    await page.click('button:has-text("English")')
    await page.click('text=한국어')
    
    await expect(page).toHaveURL('/ko')
    await expect(page.locator('h1')).toContainText('AI로 번역하고 대화하며 브라우징하세요')
  })
})
```

## 배포 체크리스트

- [ ] 모든 번역 파일 완성 (23개 언어)
- [ ] 이미지 최적화 완료
- [ ] Lighthouse 점수 90+ 달성
- [ ] 크로스 브라우저 테스트 완료
- [ ] 모바일 반응형 테스트 완료
- [ ] 분석 도구 작동 확인
- [ ] SEO 메타데이터 검증
- [ ] 보안 헤더 설정 확인
- [ ] 404/에러 페이지 작동 확인
- [ ] 사이트맵 생성 확인

## 문제 해결

### 일반적인 문제

1. **번역이 표시되지 않음**
   - messages 폴더에 모든 언어 파일이 있는지 확인
   - middleware.ts의 matcher 패턴 확인

2. **이미지가 로드되지 않음**
   - public/images 폴더 구조 확인
   - next.config.mjs의 이미지 도메인 설정 확인

3. **스타일이 적용되지 않음**
   - globals.css import 확인
   - Tailwind 설정 파일의 content 경로 확인

4. **빌드 오류**
   - TypeScript 타입 오류 확인
   - 모든 의존성이 설치되었는지 확인

## 추가 리소스

- [Next.js 15 문서](https://nextjs.org/docs)
- [Tailwind CSS v4 문서](https://tailwindcss.com/docs)
- [shadcn/ui 문서](https://ui.shadcn.com)
- [next-intl 문서](https://next-intl-docs.vercel.app)
- [Vercel 배포 가이드](https://vercel.com/docs)