# 배포 및 CI/CD 구현 가이드

Shizue 웹 애플리케이션의 자동화된 배포 파이프라인 구축과 지속적 통합/배포를 위한 종합 가이드입니다.

## 개요

안정적이고 자동화된 배포 시스템을 구축하여 개발 효율성을 극대화하고 운영 안정성을 보장합니다. Vercel을 기본 호스팅 플랫폼으로 사용하며, GitHub Actions를 통해 CI/CD 파이프라인을 구성합니다.

## 배포 아키텍처

### 인프라 구성
```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│  GitHub Repo    │────▶│GitHub Actions│────▶│  Vercel Edge   │
│  (main branch)  │     │   (CI/CD)    │     │   Network      │
└─────────────────┘     └──────────────┘     └────────────────┘
                               │                      │
                               ▼                      ▼
                        ┌─────────────┐      ┌───────────────┐
                        │  Test Suite │      │  Production   │
                        │  (Vitest)   │      │  shizue.ai    │
                        └─────────────┘      └───────────────┘
```

### 환경 구성
- **Development**: 로컬 개발 환경
- **Preview**: PR별 프리뷰 배포
- **Staging**: 프로덕션 전 테스트 환경
- **Production**: 실제 서비스 환경 (shizue.ai)

## Vercel 배포 설정

### 1. Vercel 프로젝트 초기 설정

#### Vercel CLI 설치 및 로그인
```bash
# Vercel CLI 설치
pnpm add -g vercel

# Vercel 로그인
vercel login
```

#### 프로젝트 연결
```bash
# webapp 디렉토리에서 실행
cd webapp
vercel

# 프롬프트 응답
? Set up and deploy "~/workspace/shizue/webapp"? [Y/n] Y
? Which scope do you want to deploy to? Select your team
? Link to existing project? [y/N] n
? What's your project's name? shizue-web
? In which directory is your code located? ./
? Want to override the settings? [y/N] n
```

### 2. Vercel 프로젝트 설정

`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "outputDirectory": ".next",
  "public": false,
  "github": {
    "enabled": true,
    "autoAlias": true
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
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    },
    {
      "source": "/fonts/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/images/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/",
      "destination": "/en",
      "permanent": false
    }
  ],
  "rewrites": [
    {
      "source": "/sitemap.xml",
      "destination": "/api/sitemap"
    },
    {
      "source": "/robots.txt",
      "destination": "/api/robots"
    }
  ],
  "regions": ["icn1", "hnd1", "sin1", "syd1", "cdg1", "iad1"],
  "functions": {
    "app/[locale]/page.tsx": {
      "memory": 1024,
      "maxDuration": 10
    },
    "app/api/og/[locale]/route.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

### 3. 환경 변수 설정

#### Vercel 대시보드에서 설정
```bash
# Production 환경 변수
NEXT_PUBLIC_SITE_URL=https://shizue.ai
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Build 시 필요한 변수
ANALYZE=false
NEXT_TELEMETRY_DISABLED=1
```

#### 로컬 환경 변수 (.env.local)
```bash
# Development
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

## GitHub Actions CI/CD 파이프라인

### 1. 기본 워크플로우

`.github/workflows/ci-cd.yml`:
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20.x'
  PNPM_VERSION: '9'

jobs:
  # 코드 품질 검사
  quality:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type Check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format Check
        run: pnpm format:check

  # 테스트
  test:
    name: Test Suite
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Unit Tests
        run: pnpm test:unit

      - name: Run Integration Tests
        run: pnpm test:integration

      - name: Upload Coverage
        uses: codecov/codecov-action@v3
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: ./coverage/lcov.info

  # 빌드 검증
  build:
    name: Build Verification
    runs-on: ubuntu-latest
    needs: quality
    strategy:
      matrix:
        locale: [en, ko, ja, zh-CN]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Application
        run: pnpm build
        env:
          NEXT_PUBLIC_SITE_URL: https://shizue.ai

      - name: Check Bundle Size
        run: |
          npm install -g @next/bundle-analyzer
          ANALYZE=true pnpm build
          
      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-${{ matrix.locale }}
          path: .next
          retention-days: 7

  # E2E 테스트
  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [quality, build]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright Browsers
        run: pnpm playwright install --with-deps

      - name: Run E2E Tests
        run: pnpm test:e2e
        env:
          PLAYWRIGHT_TEST_BASE_URL: ${{ secrets.PLAYWRIGHT_TEST_BASE_URL }}

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report
          retention-days: 30

  # Lighthouse CI
  lighthouse:
    name: Performance Audit
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Application
        run: pnpm build

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v10
        with:
          configPath: './lighthouserc.js'
          uploadArtifacts: true
          temporaryPublicStorage: true

  # 보안 스캔
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

      - name: Dependency Review
        uses: actions/dependency-review-action@v3
        if: github.event_name == 'pull_request'

  # Vercel 배포
  deploy-preview:
    name: Deploy Preview
    runs-on: ubuntu-latest
    needs: [test, build, e2e]
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod --no-wait'
          alias-domains: pr-{{PR_NUMBER}}.shizue.vercel.app

  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: [test, build, e2e, lighthouse, security]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to Vercel Production
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          alias-domains: |
            shizue.ai
            www.shizue.ai

      - name: Purge CDN Cache
        run: |
          curl -X POST "https://api.cloudflare.com/client/v4/zones/${{ secrets.CLOUDFLARE_ZONE_ID }}/purge_cache" \
            -H "Authorization: Bearer ${{ secrets.CLOUDFLARE_API_TOKEN }}" \
            -H "Content-Type: application/json" \
            --data '{"purge_everything":true}'

      - name: Notify Deployment
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Production deployment completed!'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
        if: always()
```

### 2. PR 검증 워크플로우

`.github/workflows/pr-check.yml`:
```yaml
name: PR Validation

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  # PR 제목 검증
  pr-title:
    name: Validate PR Title
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            style
            refactor
            perf
            test
            build
            ci
            chore
            revert

  # 번역 파일 검증
  translation-check:
    name: Translation Validation
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20.x'

      - name: Check Translation Keys
        run: |
          node scripts/validate-translations.js
          
      - name: Translation Coverage Report
        run: |
          node scripts/translation-coverage.js

  # Bundle 크기 분석
  bundle-analysis:
    name: Bundle Size Analysis
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: '9'

      - name: Analyze Bundle
        uses: preactjs/compressed-size-action@v2
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          build-script: "build"
          pattern: ".next/**/*.{js,css,html}"
```

### 3. 릴리스 워크플로우

`.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    name: Create Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate Changelog
        id: changelog
        uses: TriPSs/conventional-changelog-action@v3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          output-file: false

      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
          body: ${{ steps.changelog.outputs.clean_changelog }}
          draft: false
          prerelease: false

      - name: Deploy Production
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          production: true
```

## 모니터링 및 알림

### 1. Vercel Analytics 설정

`app/[locale]/layout.tsx`:
```typescript
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
```

### 2. 상태 모니터링

`monitoring/uptime.yml`:
```yaml
# UptimeRobot 또는 Better Uptime 설정
monitors:
  - name: Shizue Web Production
    url: https://shizue.ai
    interval: 60
    locations:
      - us-east-1
      - eu-west-1
      - ap-northeast-1
    alerts:
      - slack
      - email

  - name: API Health Check
    url: https://shizue.ai/api/health
    interval: 300
    timeout: 30
```

### 3. 에러 추적

`lib/monitoring/sentry.ts`:
```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})
```

## 배포 전략

### 1. 브랜치 전략
```
main (production)
  ├── develop (staging)
  │   ├── feature/web-123-add-hero-section
  │   ├── feature/web-124-implement-i18n
  │   └── feature/web-125-optimize-images
  └── hotfix/web-126-fix-translation
```

### 2. 배포 프로세스
1. **Feature 개발**: feature 브랜치에서 개발
2. **PR 생성**: develop 브랜치로 PR
3. **자동 검증**: CI 파이프라인 실행
4. **Preview 배포**: PR별 프리뷰 URL 생성
5. **코드 리뷰**: 팀원 리뷰 및 승인
6. **Merge**: develop 브랜치로 병합
7. **Staging 배포**: 자동 staging 배포
8. **Production 배포**: main 브랜치로 merge 시 자동 배포

### 3. 롤백 전략
```bash
# Vercel CLI를 통한 즉시 롤백
vercel rollback

# 특정 배포로 롤백
vercel rollback [deployment-url]

# Git revert를 통한 코드 롤백
git revert HEAD
git push origin main
```

## 성능 최적화

### 1. 빌드 최적화

`next.config.mjs`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  swcMinify: true,
  
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'date-fns',
    ],
  },

  // 빌드 시 제외할 패키지
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
}

export default nextConfig
```

### 2. 캐싱 전략

`public/_headers`:
```
/*
  X-DNS-Prefetch-Control: on
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/images/*
  Cache-Control: public, max-age=31536000, immutable

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/favicon.ico
  Cache-Control: public, max-age=86400, stale-while-revalidate
```

## 보안 설정

### 1. 환경 변수 보안
```bash
# Vercel Secrets 사용
vercel secrets add api-key "your-secret-value"

# 환경 변수에서 참조
vercel env add API_KEY --secret api-key
```

### 2. HTTPS 강제
```javascript
// middleware.ts
export function middleware(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto')
  const host = request.headers.get('host')
  
  if (proto !== 'https' && process.env.NODE_ENV === 'production') {
    return NextResponse.redirect(
      `https://${host}${request.nextUrl.pathname}`,
      301
    )
  }
}
```

## 문제 해결

### 일반적인 문제

1. **빌드 실패**
   - Node.js 버전 확인
   - 의존성 캐시 클리어: `pnpm store prune`
   - lock 파일 재생성: `rm -rf pnpm-lock.yaml && pnpm install`

2. **배포 실패**
   - Vercel 로그 확인: `vercel logs`
   - 환경 변수 확인: `vercel env ls`
   - 빌드 로그 분석

3. **성능 문제**
   - Bundle Analyzer 실행: `ANALYZE=true pnpm build`
   - Lighthouse 리포트 확인
   - CDN 캐시 상태 확인

4. **Edge Function 오류**
   - 메모리 제한 확인 (기본 1024MB)
   - 실행 시간 제한 확인 (기본 10초)
   - 리전별 로그 확인

## 체크리스트

### 배포 전
- [ ] 모든 테스트 통과
- [ ] 번역 파일 검증
- [ ] 환경 변수 설정 확인
- [ ] 보안 헤더 설정
- [ ] robots.txt 및 sitemap 확인
- [ ] 이미지 최적화 완료
- [ ] Bundle 크기 검증

### 배포 후
- [ ] 프로덕션 URL 접근 테스트
- [ ] 모든 언어 페이지 확인
- [ ] Analytics 작동 확인
- [ ] 에러 추적 작동 확인
- [ ] CDN 캐시 확인
- [ ] SSL 인증서 확인
- [ ] 모니터링 알림 테스트

## 유용한 명령어

### Vercel CLI
```bash
# 배포 상태 확인
vercel ls

# 로그 확인
vercel logs --follow

# 환경 변수 관리
vercel env ls
vercel env add KEY value
vercel env rm KEY

# 도메인 관리
vercel domains ls
vercel domains add shizue.ai

# 프로젝트 설정
vercel project ls
vercel link
```

### 디버깅
```bash
# 빌드 디버깅
DEBUG=* pnpm build

# Next.js 디버깅
NODE_OPTIONS='--inspect' pnpm dev

# 프로덕션 빌드 로컬 테스트
pnpm build && pnpm start
```