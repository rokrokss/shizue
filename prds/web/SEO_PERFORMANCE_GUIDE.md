# SEO 및 성능 최적화 구현 가이드

Shizue 웹 애플리케이션의 검색 엔진 최적화와 성능 최적화를 위한 종합 가이드입니다.

## 목표 지표

### Core Web Vitals
- **LCP (Largest Contentful Paint)**: < 2.5초
- **FID (First Input Delay)**: < 100ms
- **CLS (Cumulative Layout Shift)**: < 0.1
- **INP (Interaction to Next Paint)**: < 200ms

### 성능 목표
- **Lighthouse 점수**: 모든 카테고리 90점 이상
- **초기 로딩 시간**: 3G에서 3초 이내
- **번들 크기**: 초기 JS < 200KB
- **이미지 최적화**: WebP/AVIF 자동 변환

## SEO 최적화

### 1. 메타데이터 구현

#### 정적 메타데이터
`app/[locale]/layout.tsx`:
```typescript
import { Metadata } from 'next'
import { locales } from '@/lib/i18n/locales'

export async function generateMetadata({
  params: { locale }
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const baseUrl = 'https://shizue.ai'
  
  // 언어별 대체 URL 생성
  const alternateUrls = locales.reduce((acc, loc) => {
    acc[loc] = `${baseUrl}/${loc}`
    return acc
  }, {} as Record<string, string>)

  return {
    metadataBase: new URL(baseUrl),
    title: {
      template: '%s | Shizue',
      default: 'Shizue - AI Browser Extension'
    },
    description: 'Free open-source Chrome extension for AI-powered browsing',
    keywords: [
      'AI browser extension',
      'Chrome AI assistant',
      'free ChatGPT browser',
      'web page translator',
      'PDF translator',
      'YouTube subtitle translator'
    ],
    authors: [{ name: 'Shizue Team' }],
    creator: 'Shizue',
    publisher: 'Shizue',
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    alternates: {
      canonical: `/${locale}`,
      languages: alternateUrls
    },
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
      yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
      bing: process.env.NEXT_PUBLIC_BING_VERIFICATION,
    },
    category: 'technology',
  }
}
```

#### Open Graph 최적화
`lib/seo/og-image.tsx`:
```typescript
import { ImageResponse } from 'next/og'
import { localeConfigs } from '@/lib/i18n/locales'

export const runtime = 'edge'

export async function generateOGImage(locale: string) {
  const config = localeConfigs[locale as keyof typeof localeConfigs]
  
  // 언어별 폰트 로드
  const fontData = await fetch(
    new URL(`/fonts/${config.code}.ttf`, import.meta.url)
  ).then((res) => res.arrayBuffer())

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'linear-gradient(to bottom right, #1e40af, #7c3aed)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'Custom',
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 20 }}>Shizue</div>
        <div style={{ fontSize: 32, textAlign: 'center', maxWidth: 800 }}>
          {getLocalizedTagline(locale)}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Custom',
          data: fontData,
          style: 'normal',
        },
      ],
    }
  )
}
```

### 2. 구조화된 데이터

#### 조직 스키마
`components/seo/OrganizationSchema.tsx`:
```typescript
export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Shizue',
    url: 'https://shizue.ai',
    logo: 'https://shizue.ai/logo.png',
    sameAs: [
      'https://github.com/shizue',
      'https://discord.gg/shizue',
      'https://twitter.com/shizue_ai'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@shizue.ai',
      availableLanguage: ['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de']
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

#### 소프트웨어 애플리케이션 스키마
`components/seo/SoftwareApplicationSchema.tsx`:
```typescript
export function SoftwareApplicationSchema({ locale }: { locale: string }) {
  const t = useTranslations('metadata')
  
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Shizue',
    applicationCategory: 'BrowserExtension',
    operatingSystem: 'Chrome, Edge',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '1250',
      reviewCount: '890'
    },
    description: t('description'),
    screenshot: [
      'https://shizue.ai/screenshots/chat.png',
      'https://shizue.ai/screenshots/translate.png',
      'https://shizue.ai/screenshots/pdf.png'
    ],
    featureList: [
      'AI Chat Assistant',
      'Web Page Translation',
      'PDF Translation',
      'YouTube Subtitle Translation',
      'Image Text Extraction'
    ],
    softwareVersion: '2.0.0',
    datePublished: '2024-01-01',
    dateModified: '2024-12-01',
    author: {
      '@type': 'Organization',
      name: 'Shizue Team'
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

#### FAQ 스키마
`components/seo/FAQSchema.tsx`:
```typescript
export function FAQSchema({ items }: { items: Array<{ q: string; a: string }> }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a
      }
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

### 3. 사이트맵 생성

#### 동적 사이트맵
`app/sitemap.ts`:
```typescript
import { MetadataRoute } from 'next'
import { locales } from '@/lib/i18n/locales'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://shizue.ai'
  const lastModified = new Date()

  // 각 언어별 URL 생성
  const urls = locales.flatMap(locale => [
    {
      url: `${baseUrl}/${locale}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 1.0,
      alternates: {
        languages: Object.fromEntries(
          locales.map(l => [l, `${baseUrl}/${l}`])
        )
      }
    },
    // 추가 페이지가 있다면 여기에
    {
      url: `${baseUrl}/${locale}/features`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/${locale}/pricing`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }
  ])

  return urls
}
```

#### 언어별 사이트맵
`app/sitemap/[locale]/route.ts`:
```typescript
export async function GET(
  request: Request,
  { params }: { params: { locale: string } }
) {
  const { locale } = params
  const baseUrl = 'https://shizue.ai'
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
            xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <url>
        <loc>${baseUrl}/${locale}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>1.0</priority>
        ${locales.map(l => `
          <xhtml:link 
            rel="alternate" 
            hreflang="${l}" 
            href="${baseUrl}/${l}" />
        `).join('')}
      </url>
    </urlset>`

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate'
    }
  })
}
```

### 4. robots.txt 설정

`app/robots.ts`:
```typescript
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://shizue.ai'
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/'],
        crawlDelay: 1
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        crawlDelay: 0
      }
    ],
    sitemap: [
      `${baseUrl}/sitemap.xml`,
      ...locales.map(locale => `${baseUrl}/sitemap/${locale}.xml`)
    ],
    host: baseUrl
  }
}
```

## 성능 최적화

### 1. 이미지 최적화

#### Next.js Image 컴포넌트 활용
`components/common/OptimizedImage.tsx`:
```typescript
import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface OptimizedImageProps {
  src: string
  alt: string
  width: number
  height: number
  priority?: boolean
  className?: string
  sizes?: string
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
  sizes = '100vw'
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes={sizes}
        quality={85}
        placeholder="blur"
        blurDataURL={generateBlurDataURL(width, height)}
        className={cn(
          'duration-700 ease-in-out',
          isLoading ? 'scale-110 blur-2xl grayscale' : 'scale-100 blur-0 grayscale-0'
        )}
        onLoadingComplete={() => setIsLoading(false)}
      />
    </div>
  )
}

// 동적 blur placeholder 생성
function generateBlurDataURL(width: number, height: number): string {
  const shimmer = `
    <svg width="${width}" height="${height}" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g">
          <stop stop-color="#e5e7eb" offset="20%" />
          <stop stop-color="#f3f4f6" offset="50%" />
          <stop stop-color="#e5e7eb" offset="70%" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="#e5e7eb" />
      <rect id="r" width="${width}" height="${height}" fill="url(#g)" />
      <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1s" repeatCount="indefinite"  />
    </svg>`

  const toBase64 = (str: string) =>
    typeof window === 'undefined'
      ? Buffer.from(str).toString('base64')
      : window.btoa(str)

  return `data:image/svg+xml;base64,${toBase64(shimmer)}`
}
```

#### 이미지 포맷 최적화
`next.config.mjs`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1년
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'shizue.ai',
      },
    ],
  },
}
```

### 2. 번들 최적화

#### 코드 분할
`components/sections/Features.tsx`:
```typescript
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// 무거운 컴포넌트 동적 임포트
const InteractiveDemo = dynamic(() => import('./InteractiveDemo'), {
  loading: () => <DemoSkeleton />,
  ssr: false
})

const FeatureAnimation = dynamic(() => import('./FeatureAnimation'), {
  loading: () => <div className="h-64 animate-pulse bg-gray-200" />
})

export function Features() {
  return (
    <section>
      {/* 중요한 콘텐츠는 바로 렌더링 */}
      <h2>Features</h2>
      
      {/* 덜 중요한 콘텐츠는 지연 로딩 */}
      <Suspense fallback={<LoadingSpinner />}>
        <InteractiveDemo />
      </Suspense>
      
      <Suspense fallback={<div>Loading animations...</div>}>
        <FeatureAnimation />
      </Suspense>
    </section>
  )
}
```

#### 트리 쉐이킹 최적화
`lib/utils/imports.ts`:
```typescript
// ❌ 나쁜 예 - 전체 라이브러리 임포트
import * as Icons from 'lucide-react'

// ✅ 좋은 예 - 필요한 것만 임포트
import { Globe, MessageSquare, FileText } from 'lucide-react'

// 조건부 임포트
export async function loadHeavyLibrary() {
  if (typeof window !== 'undefined' && window.requestIdleCallback) {
    return new Promise((resolve) => {
      window.requestIdleCallback(async () => {
        const module = await import('heavy-library')
        resolve(module)
      })
    })
  }
}
```

### 3. 폰트 최적화

#### 가변 폰트 사용
`app/[locale]/layout.tsx`:
```typescript
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'

// 라틴 문자용 가변 폰트
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
  fallback: ['system-ui', 'arial']
})

// CJK 폰트 최적화
const notoSansCJK = localFont({
  src: [
    {
      path: '../../public/fonts/NotoSansCJK-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/NotoSansCJK-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-noto-cjk',
  display: 'swap',
  preload: false, // 필요할 때만 로드
})
```

#### 폰트 서브셋
`scripts/subset-fonts.js`:
```javascript
const fontkit = require('fontkit')
const fs = require('fs')

async function subsetFont(inputPath, outputPath, characters) {
  const font = await fontkit.open(inputPath)
  const subset = await font.createSubset()
  
  // 필요한 문자만 포함
  for (const char of characters) {
    const glyph = font.glyphForCodePoint(char.codePointAt(0))
    if (glyph) subset.includeGlyph(glyph)
  }
  
  const buffer = await subset.encode()
  fs.writeFileSync(outputPath, buffer)
}

// 각 언어별 필요 문자 추출
const koreanChars = '가나다라마바사아자차카타파하...' // 실제로는 더 많은 문자
const japaneseChars = 'あいうえお...' // 히라가나, 카타카나, 상용 한자

subsetFont(
  './fonts/NotoSansKR.ttf',
  './public/fonts/NotoSansKR-subset.woff2',
  koreanChars
)
```

### 4. 렌더링 최적화

#### 정적 생성 최적화
`app/[locale]/page.tsx`:
```typescript
// 빌드 시 모든 언어 페이지 생성
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

// 재검증 설정
export const revalidate = 86400 // 24시간

// 동적 렌더링 제어
export const dynamic = 'force-static'
export const dynamicParams = false
```

#### 스트리밍 SSR
`app/[locale]/loading.tsx`:
```typescript
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-96 bg-gray-200 rounded-lg mb-8" />
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  )
}
```

### 5. 캐싱 전략

#### 정적 자산 캐싱
`public/_headers`:
```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/images/*
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable
```

#### API 응답 캐싱
`app/api/translations/[locale]/route.ts`:
```typescript
export async function GET(
  request: Request,
  { params }: { params: { locale: string } }
) {
  const translations = await getTranslations(params.locale)
  
  return NextResponse.json(translations, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'public, s-maxage=86400',
    }
  })
}
```

### 6. Critical CSS 인라인

`app/[locale]/layout.tsx`:
```typescript
import { getCriticalCSS } from '@/lib/critical-css'

export default async function RootLayout({
  children,
  params: { locale }
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const criticalCSS = await getCriticalCSS()
  
  return (
    <html lang={locale}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalCSS }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

### 7. 리소스 힌트

`components/seo/ResourceHints.tsx`:
```typescript
export function ResourceHints() {
  return (
    <>
      {/* DNS 프리페치 */}
      <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
      
      {/* 프리커넥트 */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      
      {/* 중요 리소스 프리로드 */}
      <link 
        rel="preload" 
        href="/fonts/inter-var.woff2" 
        as="font" 
        type="font/woff2" 
        crossOrigin="anonymous" 
      />
      
      {/* 다음 페이지 프리페치 */}
      <link rel="prefetch" href="/api/features" />
    </>
  )
}
```

## 모니터링

### 1. Web Vitals 추적

`components/WebVitals.tsx`:
```typescript
'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { event } from '@/lib/analytics'

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Google Analytics로 전송
    event({
      action: 'web_vitals',
      category: 'Performance',
      label: metric.name,
      value: Math.round(metric.value)
    })

    // 콘솔에 로그 (개발 환경)
    if (process.env.NODE_ENV === 'development') {
      console.log(metric)
    }

    // 임계값 초과 시 경고
    const thresholds = {
      FCP: 1800,
      LCP: 2500,
      FID: 100,
      TTFB: 800,
      CLS: 0.1,
      INP: 200
    }

    if (metric.value > thresholds[metric.name as keyof typeof thresholds]) {
      console.warn(`Poor ${metric.name}:`, metric.value)
    }
  })

  return null
}
```

### 2. 성능 모니터링 대시보드

`lib/monitoring/performance.ts`:
```typescript
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map()

  track(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    this.metrics.get(name)!.push(value)
  }

  getMetrics(name: string) {
    const values = this.metrics.get(name) || []
    if (values.length === 0) return null

    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      p50: this.percentile(values, 0.5),
      p75: this.percentile(values, 0.75),
      p95: this.percentile(values, 0.95),
      p99: this.percentile(values, 0.99)
    }
  }

  private percentile(arr: number[], p: number): number {
    const sorted = arr.sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * p) - 1
    return sorted[index]
  }
}

// 사용 예
export const perfMonitor = new PerformanceMonitor()

// 컴포넌트 렌더링 시간 측정
export function measureComponent(name: string) {
  return function decorator(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = function (...args: any[]) {
      const start = performance.now()
      const result = originalMethod.apply(this, args)
      const end = performance.now()
      
      perfMonitor.track(`component_${name}`, end - start)
      
      return result
    }

    return descriptor
  }
}
```

## 테스트

### 1. Lighthouse CI

`.github/workflows/lighthouse.yml`:
```yaml
name: Lighthouse CI
on: [push, pull_request]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: |
          npm install -g @lhci/cli@0.12.x
          pnpm install
      
      - name: Build application
        run: pnpm build
      
      - name: Run Lighthouse CI
        run: |
          lhci autorun --config=lighthouserc.js
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

`lighthouserc.js`:
```javascript
module.exports = {
  ci: {
    collect: {
      staticDistDir: './out',
      url: [
        'http://localhost:3000/en',
        'http://localhost:3000/ko',
        'http://localhost:3000/ja'
      ]
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
}
```

### 2. 성능 E2E 테스트

`e2e/performance.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Performance', () => {
  test('meets Core Web Vitals', async ({ page }) => {
    await page.goto('/')
    
    // LCP 측정
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1]
          resolve(lastEntry.startTime)
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      })
    })
    
    expect(lcp).toBeLessThan(2500)
    
    // CLS 측정
    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let clsValue = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value
            }
          }
          resolve(clsValue)
        }).observe({ type: 'layout-shift', buffered: true })
        
        // 5초 후 측정 종료
        setTimeout(() => resolve(clsValue), 5000)
      })
    })
    
    expect(cls).toBeLessThan(0.1)
  })
  
  test('bundle size is optimized', async ({ page }) => {
    const coverage = await page.coverage.startJSCoverage()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const jsCoverage = await page.coverage.stopJSCoverage()
    
    let totalBytes = 0
    let usedBytes = 0
    
    for (const entry of jsCoverage) {
      totalBytes += entry.text.length
      for (const range of entry.ranges) {
        usedBytes += range.end - range.start - 1
      }
    }
    
    const unusedPercentage = ((totalBytes - usedBytes) / totalBytes) * 100
    expect(unusedPercentage).toBeLessThan(50)
  })
})
```

## 체크리스트

### SEO 체크리스트
- [ ] 모든 페이지에 고유한 title과 description
- [ ] Open Graph 메타태그 설정
- [ ] Twitter Card 메타태그 설정
- [ ] 구조화된 데이터 마크업
- [ ] XML 사이트맵 생성
- [ ] robots.txt 설정
- [ ] canonical URL 설정
- [ ] hreflang 태그 설정 (다국어)
- [ ] 404 페이지 최적화
- [ ] 이미지 alt 텍스트
- [ ] 의미있는 URL 구조
- [ ] SSL 인증서 설정

### 성능 체크리스트
- [ ] Core Web Vitals 목표 달성
- [ ] 이미지 최적화 (WebP/AVIF)
- [ ] 폰트 최적화 및 서브셋
- [ ] Critical CSS 인라인
- [ ] JavaScript 번들 최적화
- [ ] 코드 분할 구현
- [ ] 캐싱 전략 구현
- [ ] Gzip/Brotli 압축
- [ ] CDN 활용
- [ ] 리소스 힌트 추가
- [ ] 서드파티 스크립트 최적화
- [ ] 모바일 성능 최적화

## 문제 해결

### 일반적인 문제

1. **LCP가 높음**
   - 히어로 이미지 preload 추가
   - 서버 응답 시간 개선
   - Critical CSS 인라인

2. **CLS가 높음**
   - 이미지/광고에 명시적 크기 지정
   - 폰트 로딩 최적화
   - 동적 콘텐츠 공간 예약

3. **번들 크기가 큼**
   - 사용하지 않는 의존성 제거
   - 트리 쉐이킹 확인
   - 동적 임포트 활용

4. **SEO 점수가 낮음**
   - 메타데이터 누락 확인
   - 구조화된 데이터 검증
   - 모바일 친화성 개선