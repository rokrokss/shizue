# Shizue 웹 애플리케이션 아키텍처 설계

## 개요

Shizue 웹 애플리케이션은 Chrome 익스텐션의 가치를 효과적으로 전달하고 사용자 획득을 극대화하기 위한 현대적인 홍보 웹사이트입니다. Next.js 15 App Router를 기반으로 하며, 23개 언어를 지원하는 글로벌 서비스로 설계되었습니다.

## 핵심 설계 원칙

### 1. 성능 우선 (Performance First)
- **정적 생성(SSG)** 기본 전략으로 빠른 로딩 속도 보장
- **이미지 최적화** 및 lazy loading으로 초기 로딩 최소화
- **Edge Runtime** 활용으로 글로벌 사용자에게 빠른 응답

### 2. SEO 최적화
- **구조화된 데이터** 마크업으로 검색 엔진 가시성 극대화
- **다국어 SEO** 전략으로 각 지역별 검색 결과 최적화
- **Open Graph** 및 Twitter Card 메타데이터 완벽 지원

### 3. 접근성 (Accessibility)
- **WCAG 2.1 AA** 준수
- **키보드 네비게이션** 완벽 지원
- **스크린 리더** 호환성 보장

### 4. 확장성 (Scalability)
- **컴포넌트 기반** 아키텍처로 유지보수 용이
- **API 준비** 구조로 향후 백엔드 통합 가능
- **모듈형 설계**로 기능 추가 용이

## 기술 스택

### Core Framework
```typescript
// Next.js 15 with App Router
{
  "next": "^15.0.0",
  "react": "^19.0.0",
  "typescript": "^5.5.0"
}
```

### Styling & UI
```typescript
{
  "tailwindcss": "^4.0.0",
  "@shadcn/ui": "latest",
  "framer-motion": "^11.0.0",
  "lucide-react": "^0.400.0"
}
```

### Internationalization
```typescript
{
  "next-intl": "^3.20.0",
  "@formatjs/intl": "^2.10.0"
}
```

### Analytics & Monitoring
```typescript
{
  "@vercel/analytics": "^1.3.0",
  "@vercel/speed-insights": "^1.0.0",
  "posthog-js": "^1.150.0"
}
```

### Development Tools
```typescript
{
  "eslint": "^9.0.0",
  "prettier": "^3.3.0",
  "@testing-library/react": "^16.0.0",
  "vitest": "^2.0.0",
  "playwright": "^1.45.0"
}
```

## 프로젝트 구조

```
webapp/
├── app/
│   ├── [locale]/                    # 다국어 라우팅
│   │   ├── layout.tsx              # 루트 레이아웃
│   │   ├── page.tsx                # 홈페이지
│   │   ├── error.tsx               # 에러 페이지
│   │   └── not-found.tsx           # 404 페이지
│   ├── api/                        # API 라우트 (향후)
│   └── sitemap.ts                  # 동적 사이트맵
├── components/
│   ├── ui/                         # shadcn/ui 컴포넌트
│   ├── layout/
│   │   ├── Header.tsx              # 헤더 네비게이션
│   │   ├── Footer.tsx              # 푸터
│   │   └── LanguageSelector.tsx   # 언어 선택기
│   ├── sections/
│   │   ├── Hero.tsx                # 히어로 섹션
│   │   ├── Features.tsx            # 기능 카드
│   │   ├── AIModels.tsx            # AI 모델 소개
│   │   ├── HowItWorks.tsx          # 작동 방식
│   │   ├── Comparison.tsx          # 가격 비교
│   │   ├── Testimonials.tsx        # 사용자 후기
│   │   ├── FAQ.tsx                 # 자주 묻는 질문
│   │   └── FinalCTA.tsx            # 최종 CTA
│   └── common/
│       ├── AnimatedSection.tsx     # 애니메이션 래퍼
│       ├── FeatureCard.tsx         # 기능 카드
│       └── CTAButton.tsx           # CTA 버튼
├── lib/
│   ├── i18n/
│   │   ├── config.ts               # i18n 설정
│   │   ├── locales.ts              # 지원 언어 목록
│   │   └── request.ts              # locale 요청 처리
│   ├── analytics.ts                # 분석 도구 통합
│   ├── constants.ts                # 상수 정의
│   └── utils.ts                    # 유틸리티 함수
├── messages/                        # 번역 파일
│   ├── ar.json
│   ├── bn.json
│   ├── de.json
│   ├── en.json                     # 기본 언어
│   ├── es.json
│   ├── fa.json
│   ├── fil.json
│   ├── fr.json
│   ├── hi.json
│   ├── it.json
│   ├── ja.json
│   ├── ko.json
│   ├── pl.json
│   ├── pt-BR.json
│   ├── pt-PT.json
│   ├── ru.json
│   ├── sw.json
│   ├── th.json
│   ├── tr.json
│   ├── ur.json
│   ├── vi.json
│   ├── zh-CN.json
│   └── zh-TW.json
├── public/
│   ├── images/
│   │   ├── hero/                   # 히어로 이미지
│   │   ├── features/               # 기능 스크린샷
│   │   ├── demos/                  # 데모 GIF
│   │   └── logos/                  # AI 모델 로고
│   ├── fonts/                      # 웹폰트
│   └── icons/                      # 파비콘, 아이콘
├── styles/
│   └── globals.css                 # 전역 스타일
├── types/
│   ├── global.d.ts                 # 전역 타입
│   └── i18n.d.ts                   # i18n 타입
├── middleware.ts                   # Next.js 미들웨어
├── next.config.mjs                 # Next.js 설정
├── tailwind.config.ts              # Tailwind 설정
├── tsconfig.json                   # TypeScript 설정
└── package.json                    # 프로젝트 메타데이터
```

## 다국어 지원 아키텍처

### URL 구조
```
shizue.ai/[locale]/
├── shizue.ai/en/          # 영어 (기본)
├── shizue.ai/ko/          # 한국어
├── shizue.ai/ja/          # 일본어
├── shizue.ai/zh-CN/       # 중국어 간체
├── shizue.ai/zh-TW/       # 중국어 번체
└── ... (23개 언어)
```

### Middleware 설정
```typescript
// middleware.ts
import { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/i18n/middleware'

export function middleware(request: NextRequest) {
  return createMiddlewareClient(request)
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
}
```

### 언어 감지 전략
1. **URL 파라미터** 우선 (명시적 선택)
2. **쿠키** 확인 (이전 선택 기억)
3. **Accept-Language 헤더** 분석
4. **IP 기반 지역 감지** (Vercel Edge Network)
5. **기본값**: 영어 (en)

## 컴포넌트 아키텍처

### 서버 컴포넌트 vs 클라이언트 컴포넌트

#### 서버 컴포넌트 (기본)
- 정적 콘텐츠 렌더링
- 번역 텍스트 로딩
- SEO 메타데이터 생성
- 데이터 페칭 (향후 API 연동 시)

#### 클라이언트 컴포넌트
- 언어 선택기
- 인터랙티브 애니메이션
- 분석 이벤트 추적
- 동적 상태 관리

### 핵심 컴포넌트 설계

#### Hero 섹션
```typescript
interface HeroProps {
  locale: string
  messages: {
    title: string
    subtitle: string
    cta: {
      chrome: string
      edge: string
    }
  }
}
```

#### Feature 카드
```typescript
interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  highlight?: string
  demo?: string // GIF or video URL
}
```

#### AI Model 그리드
```typescript
interface AIModelProps {
  provider: 'openai' | 'anthropic' | 'google'
  models: {
    name: string
    description: string
    bestFor: string
  }[]
  logo: string
}
```

## 성능 최적화 전략

### 1. 정적 생성 (Static Generation)
```typescript
// app/[locale]/page.tsx
export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}
```

### 2. 이미지 최적화
- Next.js Image 컴포넌트 활용
- WebP/AVIF 포맷 자동 변환
- 반응형 이미지 srcset
- Lazy loading 기본 적용

### 3. 폰트 최적화
```typescript
// app/[locale]/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})
```

### 4. 번들 최적화
- Tree shaking
- Code splitting by route
- Dynamic imports for heavy components
- CSS 모듈 최적화

## SEO 전략

### 메타데이터 생성
```typescript
export async function generateMetadata({ params }) {
  const locale = params.locale
  const messages = await getMessages(locale)

  return {
    title: messages.seo.title,
    description: messages.seo.description,
    openGraph: {
      images: [`/og-${locale}.png`],
    },
    alternates: {
      canonical: `https://shizue.ai/${locale}`,
      languages: generateAlternateLinks(locale),
    },
  }
}
```

### 구조화된 데이터
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Shizue",
  "applicationCategory": "BrowserExtension",
  "operatingSystem": "Chrome, Edge",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

## 분석 및 모니터링

### 추적 이벤트
- 페이지 조회
- CTA 클릭
- 언어 변경
- 섹션별 스크롤 깊이
- 외부 링크 클릭

### 성능 모니터링
- Core Web Vitals (LCP, FID, CLS)
- 페이지 로드 시간
- API 응답 시간 (향후)
- 에러 추적

## 보안 고려사항

### Content Security Policy
```typescript
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' *.vercel-insights.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self';
  connect-src 'self' *.vercel-insights.com;
`
```

### 보안 헤더
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=()

## 배포 전략

### Vercel 배포
```json
{
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "devCommand": "next dev",
  "installCommand": "pnpm install",
  "framework": "nextjs"
}
```

### 환경 변수
```bash
# Production
NEXT_PUBLIC_SITE_URL=https://shizue.ai
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
VERCEL_ANALYTICS_ID=xxxxx

# Development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 향후 확장 계획

### Phase 2: API 통합
- 사용자 피드백 수집 API
- 뉴스레터 구독 시스템
- 다운로드 통계 추적

### Phase 3: 웹 서비스
- 온라인 번역 도구
- API 키 관리 대시보드
- 사용량 통계 시각화

## 기술적 의사결정 기록

### Next.js 15 App Router 선택 이유
1. **서버 컴포넌트**: 초기 로딩 성능 최적화
2. **정적 생성**: 글로벌 CDN 배포 최적화
3. **내장 i18n 지원**: 다국어 라우팅 간소화
4. **이미지 최적화**: 자동 최적화 및 lazy loading

### Tailwind CSS v4 + shadcn/ui 선택 이유
1. **빠른 개발**: 유틸리티 우선 접근법
2. **일관성**: 디자인 시스템 구축 용이
3. **커스터마이징**: 브랜드 아이덴티티 반영 용이
4. **접근성**: shadcn/ui의 기본 접근성 지원

### Vercel 호스팅 선택 이유
1. **Next.js 최적화**: 프레임워크 제작사의 호스팅
2. **글로벌 CDN**: 전 세계 빠른 로딩
3. **자동 최적화**: 이미지, 폰트 자동 최적화
4. **분석 도구**: 내장 분석 및 성능 모니터링
