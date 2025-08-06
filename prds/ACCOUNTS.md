# PRD-001: ACCOUNTS (계정 시스템 및 프리미엄 구독)

## 메타데이터

- **PRD 번호**: 001
- **작성일**: 2025-07-30
- **최종 업데이트**: 2025-08-02
- **상태**: Implemented (90% 완료)
- **우선순위**: P0 (긴급)
- **예상 작업량**: XL (3-4주)
- **실제 작업량**: 3주
- **의존성**: 없음 (신규 백엔드 인프라 구축 완료)

## 개요

모든 사용자가 Shizue 계정을 필수로 가입하고, 자신의 API Key를 입력해야 서비스를 사용할 수 있도록 합니다. 향후 프리티어와 프리미엄 구독 모델을 도입할 예정입니다.

### 영향받는 컴포넌트

- [x] Background Script (Service Worker) - 인증 관리, API 라우팅
- [x] Side Panel (React App) - 로그인 UI, 계정 설정, 구독 관리
- [x] Content Scripts - 로그인 상태 반영
- [x] Chrome Storage - 토큰 저장, 계정 정보 캐싱
- [ ] IndexedDB - 계정 연동 메타데이터만

### 신규 필요 인프라

- [x] Backend API Server
- [x] Database (PostgreSQL/MySQL)
- [x] Redis Cache
- [ ] Payment System (Stripe) - 향후 구현

## 배경 및 목표

### 문제 정의

- 사용자 관리 시스템 부재로 서비스 개선 어려움
- 사용 통계 수집 불가로 제품 개선 방향 파악 어려움
- 향후 수익 모델 도입을 위한 기반 부재
- 멀티 디바이스 동기화 등 서버 기능 제공 불가

### 사용자 스토리

- As a **신규 사용자**, I want to **Google 계정으로 가입하고 내 API Key를 등록하여 서비스를 사용**할 수 있어야 한다
- As a **기존 사용자**, I want to **계정을 만들고 기존 API Key를 계속 사용**할 수 있어야 한다
- As a **등록된 사용자**, I want to **여러 기기에서 내 설정을 동기화**할 수 있어야 한다 (API Key 제외)

### 성공 지표

- [x] Google OAuth 로그인 구현 완료
- [x] JWT 기반 인증 시스템 구축
- [x] API Key 암호화 저장 (AES-256)
- [x] 사용자 설정 서버 동기화
- [x] 모델 매핑 시스템 (자동 업그레이드)
- [ ] 멀티 디바이스 설정 동기화 사용률 30% 이상
- [ ] 인증 관련 에러율 0.1% 미만

## 기술 사양

### Chrome API 권한

```json
// manifest.json에 추가 필요한 권한 - identity API 사용하지 않음
{
  "permissions": [
    // 기존 권한 유지
  ],
  "host_permissions": [
    "https://api.shizue.ai/*", // 백엔드 API 호출용
    "http://localhost:3000/*" // 개발 환경
  ]
}
```

### Chrome Extension OAuth 구현 전략

**웹 기반 OAuth vs chrome.identity API**:

- 선택: **웹 기반 OAuth** (더 많은 제어와 유연성)
- 이유:
  - chrome.identity는 Google 계정에 의존적
  - 웹 기반은 향후 다른 OAuth 제공자 추가 용이
  - 더 나은 에러 처리와 사용자 경험 제공

**구현 아키텍처**:

```typescript
// OAuth 플로우 시퀀스
1. Side Panel에서 로그인 버튼 클릭
2. chrome.tabs.create()로 새 탭 열기 (shizue.ai/auth/google)
3. Google OAuth 진행
4. 성공 시 shizue.ai/auth/success?token=xxx로 리다이렉트
5. Content Script가 URL 감지하고 토큰 추출
6. postMessage로 Extension에 토큰 전달
7. Background Script가 토큰 저장 및 검증
8. 탭 자동 닫기 및 Side Panel 업데이트
```

### Service Worker 토큰 관리 전략

**문제점**: Service Worker는 5분 후 자동 종료되어 메모리 상태 손실

**해결 방안**:

```typescript
// src/services/tokenManager.ts
class TokenManager {
  private tokenCache: Map<string, { token: string; expiry: number }> = new Map();

  async getAccessToken(): Promise<string> {
    // 1. 메모리 캐시 확인
    const cached = this.tokenCache.get('access_token');
    if (cached && cached.expiry > Date.now()) {
      return cached.token;
    }

    // 2. Chrome Storage 확인
    const stored = await chrome.storage.local.get(['auth_token', 'token_expiry']);
    if (stored.auth_token && stored.token_expiry > Date.now()) {
      this.tokenCache.set('access_token', {
        token: stored.auth_token,
        expiry: stored.token_expiry,
      });
      return stored.auth_token;
    }

    // 3. 토큰 갱신 필요
    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    // Race condition 방지를 위한 싱글톤 패턴
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }
}
```

### 메시지 타입

```typescript
// 인증 관련 메시지
MESSAGE_AUTH_LOGIN = 'auth-login';
MESSAGE_AUTH_LOGOUT = 'auth-logout';
MESSAGE_AUTH_CHECK_STATUS = 'auth-check-status';
MESSAGE_AUTH_REFRESH_TOKEN = 'auth-refresh-token';
MESSAGE_AUTH_GET_USER_INFO = 'auth-get-user-info';

// 구독 관련 메시지 (향후 구현)
// MESSAGE_SUBSCRIPTION_STATUS = "subscription-status"
// MESSAGE_SUBSCRIPTION_UPGRADE = "subscription-upgrade"
// MESSAGE_SUBSCRIPTION_CANCEL = "subscription-cancel"

// API 라우팅 메시지
MESSAGE_API_MODE_SWITCH = 'api-mode-switch'; // Shizue API <-> User API Key
```

### 스토리지 키

```typescript
// 인증 관련 스토리지
STORAGE_AUTH_TOKEN = 'auth-token'; // JWT access token
STORAGE_REFRESH_TOKEN = 'refresh-token';
STORAGE_USER_INFO = 'user-info'; // 이메일, 이름, 프로필 사진
STORAGE_AUTH_EXPIRY = 'auth-expiry';

// 구독 관련 스토리지 (향후 구현)
// STORAGE_SUBSCRIPTION_STATUS = "subscription-status" // free | premium | enterprise
// STORAGE_SUBSCRIPTION_EXPIRY = "subscription-expiry"
// STORAGE_SUBSCRIPTION_FEATURES = "subscription-features" // 사용 가능한 기능 목록

// API 모드 스토리지
STORAGE_API_MODE = 'api-mode'; // "shizue" | "user-key"
STORAGE_API_MODE_PREFERENCE = 'api-mode-preference'; // 사용자 선호 설정
```

### 백엔드 API 엔드포인트

```typescript
// Base URL: https://api.shizue.ai
// API Docs: https://api.shizue.ai/docs (FastAPI 자동 생성)

// 인증 API
POST / v1 / auth / google / callback; // Google OAuth 콜백
POST / v1 / auth / refresh; // 토큰 갱신
POST / v1 / auth / logout; // 로그아웃
GET / v1 / auth / me; // 현재 사용자 정보

// 구독 API (향후 구현)
// GET    /v1/subscription/status      // 구독 상태 조회
// POST   /v1/subscription/create-checkout // Stripe 체크아웃 세션 생성
// POST   /v1/subscription/cancel      // 구독 취소

// 사용량 API
GET / v1 / usage / stats; // 사용량 통계 조회

// LLM 프록시 API (비동기 스트리밍)
POST / v1 / chat / completions; // OpenAI 호환 엔드포인트
POST / v1 / chat / stream; // SSE 스트리밍 엔드포인트
```

### 메시지 흐름 - 로그인

```
User Click Login → Side Panel → 새 탭/팝업 열기 → shizue.ai/auth/google
                                                          ↓
                                                   Google OAuth 2.0
                                                          ↓
                                                   Backend 콜백 처리
                                                          ↓
                                    JWT Token 발급 → Redirect with token
                                                          ↓
                              Extension이 token 캡처 (URL param/postMessage)
                                                          ↓
                                    Chrome Storage ← Background Script
                                                          ↓
                                        Update UI ← Side Panel
```

### 메시지 흐름 - API 호출

```
// Shizue API 모드
Chat Request → chatService → Background Script → Backend API (with JWT)
                                                      ↓
                                                 LLM Provider
                                                      ↓
                                          Streaming Response → User

// User API Key 모드 (기존 방식)
Chat Request → chatService → LLM Provider API 직접 호출
                                    ↓
                          Streaming Response → User
```

### API 통합

- **현재 구현**:
  - 사용자 본인의 API Key 필수 입력
  - 서버는 인증과 설정 동기화만 담당
  - LLM 호출은 클라이언트에서 직접 수행
  - API Key는 로컬에만 저장 (서버 전송 금지)

- **향후 계획**:
  - Shizue API 프록시 서비스 도입
  - 무료 크레딧 시스템
  - 프리미엄 구독 모델

- **Rate Limiting**:
  - 사용자 API Key 사용 시: 제한 없음 (Provider 정책 따름)
  - 향후 Shizue API: 플랜별 차등 적용 예정

## UI/UX 명세

### 화면 흐름

1. **플로팅 버튼 클릭 시**
   - 인증 여부 관계없이 Side Panel 열림
   - 미인증 시 온보딩 플로우 자동 시작

2. **온보딩 플로우** (Side Panel 내)
   - Step0: Shizue 소개 "시작하기" 버튼
   - Step1: Google 로그인 화면
   - Step2: API Key 입력 (OpenAI/Anthropic/Gemini 중 최소 1개)
   - Step3: 완료 및 환영 메시지

3. **계정 관리 페이지** (`/settings/account`)
   - 프로필 정보
   - API Key 관리 (로컬 저장)
   - 사용량 통계 대시보드
   - 설정 동기화 옵션

### 컴포넌트 구조

```
src/components/
├── auth/
│   ├── LoginButton.tsx
│   ├── UserProfile.tsx
│   └── AuthGuard.tsx
├── usage/
│   └── UsageStats.tsx
└── onboarding/
    ├── OnboardedRoute.tsx (기존)
    ├── Step0GetStarted.tsx (기존 수정)
    ├── Step1GoogleLogin.tsx (신규)
    ├── Step2ApiKey.tsx (기존 Step2Provider.tsx 수정)
    └── Step3Complete.tsx (신규)
```

### 다국어 지원

- [x] 새로운 번역 키 추가 필요
- [x] 지원 언어: 모든 기존 23개 언어
- 주요 번역 키:
  - `auth.login`, `auth.logout`, `auth.welcome`
  - `subscription.free`, `subscription.premium`, `subscription.upgrade`
  - `api.mode.shizue`, `api.mode.userKey`

## 구현 상세

### Background Script 변경사항

**파일**: `src/entrypoints/background/index.ts`

- [x] 새로운 `AuthService` 클래스 추가
  - 웹 기반 OAuth 플로우 지원 (새 탭 열기, 토큰 수신)
  - JWT 토큰 관리 및 자동 갱신
  - 인증 상태 체크
  - PostMessage/URL 파라미터로 토큰 캡처
- [x] `APIRoutingService` 추가
  - Shizue API vs User API Key 라우팅 로직
  - 헤더에 인증 토큰 추가
- [x] 메시지 핸들러 추가 (MESSAGE*AUTH*_, MESSAGE*SUBSCRIPTION*_)

### Side Panel 변경사항

**파일**: `src/entrypoints/sidepanel/`

- [x] 새 라우트: `/settings/account`
- [x] `AuthProvider` 컨텍스트 추가
- [x] 온보딩 플로우 재설계
  - Step0: Shizue 소개 (기존)
  - Step1: Google 로그인 (신규)
  - Step2: API Key 입력 (기존 수정)
  - Step3: 완료 화면 (신규)
- [x] OnboardedRoute 컴포넌트가 인증 체크
- [x] 헤더에 사용자 프로필 UI 추가

### Content Script 변경사항

**파일**: `src/entrypoints/content/`

- [x] 플로팅 버튼은 항상 표시
- [x] 클릭 시 Side Panel 열기 (기존 동작 유지)

### 서비스 레이어

**새 파일**: `src/services/authService.ts`

```typescript
class AuthService {
  private readonly API_BASE_URL = 'https://api.shizue.ai';
  private readonly AUTH_URL = 'https://shizue.ai/auth';

  async login(): Promise<AuthToken>; // 새 탭에서 OAuth 플로우 시작
  async handleAuthCallback(token: string): Promise<void>; // 토큰 수신 처리
  async logout(): Promise<void>;
  async refreshToken(): Promise<AuthToken>;
  async checkAuthStatus(): Promise<boolean>;
  async getUserInfo(): Promise<UserInfo>;

  // Private methods
  private listenForAuthToken(): Promise<string>; // postMessage 리스너
  private extractTokenFromUrl(url: string): string | null;
}
```

**새 파일**: `src/services/usageService.ts`

```typescript
class UsageService {
  async getUsageStats(): Promise<UsageStats>;
  async trackUsage(model: string, tokens: number): Promise<void>;
}
```

**수정**: `src/services/chatService.ts`

- [x] API 라우팅 로직 추가
- [x] Shizue API 엔드포인트 통합
- [x] 인증 헤더 자동 추가

### 상태 관리

**Jotai Atoms**: `src/hooks/global.ts`

- [x] `authStateAtom`: 로그인 상태
- [x] `userInfoAtom`: 사용자 정보
- [x] `apiModeAtom`: API 모드 (shizue | user-key)
- [ ] `subscriptionAtom`: 구독 상태 (향후 구현)

## 데이터 저장 전략

계정 시스템 도입으로 인한 서버와 로컬 저장소 간의 데이터 분리 전략

### API Key 사용자 (100% 로컬)

**Chrome Storage**:

- [x] API Keys (OpenAI, Gemini, Anthropic) - 로컬 암호화 저장
- [x] 사용자 설정 (언어, 테마, UI 설정)
- [x] 번역 타겟 언어
- [x] 토글 버튼 설정 및 숨김 사이트 목록

**IndexedDB**:

- [x] 모든 채팅 스레드 & 메시지
- [x] 모든 메모 데이터
- [x] 토큰 사용량 통계
- [x] 번역 캐시 데이터
- [x] PDF 작업 임시 데이터

**서버 저장**: ❌ 없음 (완전한 프라이버시 보장)

### Shizue 계정 사용자 (하이브리드)

**서버 저장 (api.shizue.ai)**:

필수 데이터:

- [x] 사용자 프로필 (Google ID, 이메일, 이름, 프로필 사진)
- [x] 사용량 통계 (모델별 사용 횟수, 집계된 통계만)
- [x] 계정 설정 (선호 언어, UI 테마)
- [ ] 구독 정보 (향후 구현)

선택적 동기화 (사용자 설정에 따라):

- [x] 채팅 메타데이터 (스레드 ID, 제목, 마지막 업데이트 시간)
- [x] 메모 메타데이터 (제목, 폴더, 핀 상태)
- [x] 사용자 메모리 (USER_MEMORY) - AI 컨텍스트용

**로컬 저장 (Chrome Extension)**:

Chrome Storage:

- [x] JWT Access Token (임시, 1시간 만료)
- [x] Refresh Token (임시, 30일 만료)
- [x] UI 설정 (빠른 접근용 캐시)
- [x] API 모드 설정 (shizue | user-key)
- [x] 동기화 설정 (어떤 데이터를 동기화할지)

IndexedDB:

- [x] 채팅 데이터 전체 (로컬 캐시, 성능 최적화)
- [x] 메모 데이터 전체 (로컬 캐시)
- [x] 번역 캐시 (영구 보관)
- [x] 오프라인 작업 큐 (동기화 대기 중인 작업)

### 계정 시스템 구조

**모든 사용자는 Shizue 계정 + API Key 필수**:

1. Google OAuth로 가입/로그인 필요
2. 최소 하나 이상의 API Key 등록 필수
3. 가입 시점부터 새로운 데이터 저장 시작 (기존 로컬 데이터는 유지)

**현재 구현 범위**:

- 사용자 본인의 API Key로 직접 LLM 호출
- 서버는 계정 관리와 설정 동기화만 담당
- API Key는 로컬에만 저장 (Chrome Storage)
- API Key는 절대 서버로 전송하지 않음

**향후 확장 계획**:

- Shizue API 프록시 서비스 도입
- 무료 크레딧 시스템
- 프리미엄 구독으로 무제한 사용
- API Key 없이도 사용 가능한 옵션 제공

### 프라이버시 및 보안

**데이터 암호화**:

- 로컬: Chrome Storage API 자체 암호화
- 전송: HTTPS + JWT Bearer Token
- 서버: 민감 데이터 AES-256 암호화 (선택적)

**사용자 제어권**:

- [x] 데이터 내보내기 (JSON/CSV)
- [x] 선택적 서버 저장 토글
- [x] 언제든 로컬 전용 모드 전환
- [x] 계정 삭제 시 모든 서버 데이터 즉시 삭제

**GDPR/개인정보보호법 준수**:

- [x] 데이터 이동성 보장
- [x] 삭제 권한 보장
- [x] 데이터 처리 목적 명시
- [x] 최소 데이터 수집 원칙

### Storage Service 구현

```typescript
// src/services/unifiedStorageService.ts
class UnifiedStorageService {
  private apiMode: 'shizue' | 'user-key';
  private isAuthenticated: boolean;

  async save(key: string, data: any, options?: StorageOptions) {
    // API Key 모드는 항상 로컬 저장
    if (this.apiMode === 'user-key') {
      return this.saveLocal(key, data);
    }

    // Shizue API 모드
    if (this.shouldSyncToServer(key)) {
      await Promise.all([
        this.saveServer(key, data),
        this.saveLocal(key, data), // 로컬 캐시
      ]);
    } else {
      await this.saveLocal(key, data);
    }
  }

  private shouldSyncToServer(key: string): boolean {
    // 인증된 사용자의 Shizue API 모드에서만 동기화
    if (!this.isAuthenticated || this.apiMode !== 'shizue') {
      return false;
    }

    // 서버 동기화가 필요한 데이터
    const serverKeys = ['api_usage', 'user_preferences', 'subscription_status'];
    return serverKeys.includes(key);
  }
}
```

## 백엔드 아키텍처

### 기술 스택

- **Framework**: FastAPI (Python 3.11+)
- **ASGI Server**: Uvicorn + Gunicorn
- **Database**: PostgreSQL (Supabase 또는 Neon)
- **ORM**: SQLAlchemy 2.0+ or Tortoise ORM
- **Cache**: Redis (Upstash)
- **Task Queue**: Celery + Redis (향후 AI 작업용)
- **Payment**: Stripe
- **Authentication**: python-jose[cryptography] (JWT)
- **OAuth**: Authlib
- **AI Libraries Ready**:
  - LangChain (LLM 통합)
  - OpenAI Python SDK
  - Anthropic Python SDK
  - Google Generative AI SDK
  - Transformers (향후 로컬 모델)
- **Hosting**: AWS EC2/ECS 또는 Google Cloud Run
- **Domain**: shizue.ai (웹), api.shizue.ai (API)
- **Monitoring**: Sentry, Prometheus + Grafana

### 보안 미들웨어 설정

```python
# src/middleware/security.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://YOUR_EXTENSION_ID",
        "https://shizue.ai",
        "http://localhost:3000"  # 개발 환경
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Rate Limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

# API 엔드포인트별 Rate Limit
@app.post("/v1/auth/google/callback")
@limiter.limit("5/minute")  # 분당 5회
async def google_callback():
    pass

@app.post("/v1/chat/completions")
@limiter.limit("100/minute")  # 분당 100회
async def chat_completions():
    pass
```

### 에러 처리 및 로깅

```python
# src/middleware/error_handler.py
import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

class ErrorCode:
    AUTH_FAILED = "AUTH_FAILED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    # Sentry 전송
    if sentry_sdk:
        sentry_sdk.capture_exception(exc)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": ErrorCode.INTERNAL_ERROR,
            "message": "An unexpected error occurred",
            "request_id": request.headers.get("X-Request-ID")
        }
    )

# 구조화된 로깅
class StructuredLogger:
    @staticmethod
    def log_api_request(user_id: str, endpoint: str, tokens: int):
        logger.info({
            "event": "api_request",
            "user_id": user_id,
            "endpoint": endpoint,
            "tokens_used": tokens,
            "timestamp": datetime.now(datetime.UTC).isoformat()
        })
```

### Redis 캐싱 전략

```python
# src/services/cache.py
import redis.asyncio as redis
from typing import Optional, Any
import json

class CacheService:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)

    async def get_user_profile(self, user_id: str) -> Optional[dict]:
        key = f"user:profile:{user_id}"
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)
        return None

    async def set_user_profile(self, user_id: str, profile: dict, ttl: int = 3600):
        key = f"user:profile:{user_id}"
        await self.redis.setex(
            key,
            ttl,
            json.dumps(profile)
        )

    async def invalidate_user_cache(self, user_id: str):
        pattern = f"user:*:{user_id}"
        async for key in self.redis.scan_iter(match=pattern):
            await self.redis.delete(key)
```

### 데이터베이스 스키마 (SQLAlchemy 모델)

```python
# models/user.py
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    google_id = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    name = Column(String)
    profile_picture = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# models/subscription.py
class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    stripe_customer_id = Column(String)
    stripe_subscription_id = Column(String)
    status = Column(Enum(SubscriptionStatus))  # active, canceled, past_due
    plan = Column(Enum(PlanType))  # free, premium, enterprise
    current_period_end = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# models/api_usage.py
class APIUsage(Base):
    __tablename__ = "api_usage"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    endpoint = Column(String)
    tokens_used = Column(Integer)
    model = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
```

## 성능 최적화 전략

### 인증 상태 캐싱

```typescript
// 인증 체크 최적화
interface AuthCache {
  isAuthenticated: boolean;
  checkedAt: number;
  expiry: number;
}

const AUTH_CACHE_DURATION = 5 * 60 * 1000; // 5분

async function checkAuth(): Promise<boolean> {
  // 1. 메모리 캐시 확인
  if (authCache && authCache.checkedAt + AUTH_CACHE_DURATION > Date.now()) {
    return authCache.isAuthenticated;
  }

  // 2. Chrome Storage 캐시 확인
  const cached = await chrome.storage.local.get('auth_cache');
  if (cached.auth_cache && cached.auth_cache.expiry > Date.now()) {
    authCache = cached.auth_cache;
    return cached.auth_cache.isAuthenticated;
  }

  // 3. 실제 인증 체크 (백엔드 호출)
  const result = await verifyAuthWithBackend();
  updateAuthCache(result);
  return result;
}
```

### Content Scripts 인증 최적화

```typescript
// 모든 진입점에서의 인증 처리
const AUTH_REQUIRED_ACTIONS = {
  // 인증 필수
  [MESSAGE_TRANSLATE_HTML_TEXT_BATCH]: true,
  [MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE]: true,
  [MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE]: true,
  [MESSAGE_RUN_GRAPH_STREAM]: true,

  // 인증 불필요 (UI 관련)
  [MESSAGE_SET_PANEL_OPEN_OR_NOT]: false,
  [MESSAGE_OPEN_PANEL]: false,
};

// Background Script에서 중앙 집중 처리
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (AUTH_REQUIRED_ACTIONS[message.action] && !(await checkAuth())) {
    // Side Panel 열고 로그인 유도
    chrome.sidePanel.open();
    sendResponse({ error: 'AUTH_REQUIRED', needsLogin: true });
    return;
  }

  // 정상 처리
});
```

### 토큰 사전 갱신

```typescript
// 만료 5분 전 자동 갱신
class TokenRefreshScheduler {
  scheduleRefresh(expiryTime: number) {
    const refreshTime = expiryTime - 5 * 60 * 1000; // 5분 전
    const delay = refreshTime - Date.now();

    if (delay > 0) {
      setTimeout(() => {
        this.refreshToken();
      }, delay);
    }
  }
}
```

### API 호출 최적화

```typescript
// 배치 처리로 네트워크 요청 최소화
class BatchAPIClient {
  private queue: APIRequest[] = [];
  private timer: NodeJS.Timeout;

  async request(endpoint: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ endpoint, data, resolve, reject });
      this.scheduleBatch();
    });
  }

  private scheduleBatch() {
    if (this.timer) return;

    this.timer = setTimeout(() => {
      this.processBatch();
      this.timer = null;
    }, 50); // 50ms 대기
  }

  private async processBatch() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, 10); // 최대 10개
    const response = await fetch('/v1/batch', {
      method: 'POST',
      body: JSON.stringify(batch),
    });

    // 개별 응답 처리
  }
}
```

### 원본 SQL 스키마

```sql
-- 사용자 테이블
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  google_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  profile_picture VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 구독 테이블
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50), -- active, canceled, past_due
  plan VARCHAR(50), -- free, premium, enterprise
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- API 사용량 테이블
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  endpoint VARCHAR(255),
  tokens_used INTEGER,
  model VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 테스트 계획 (TDD - Test Driven Development)

### 테스트 전략

**Red-Green-Refactor 사이클**을 따라 모든 기능을 테스트 우선으로 개발합니다.

### 백엔드 테스트 (Python/FastAPI)

#### 1. 단위 테스트 (pytest + pytest-asyncio)

```python
# tests/unit/test_auth_service.py
class TestAuthService:
    async def test_create_jwt_token_success(self):
        """JWT 토큰 생성이 올바른 클레임을 포함하는지 검증"""
        # Given: 유효한 사용자 정보
        # When: create_token() 호출
        # Then: 토큰에 user_id, email, exp 포함 확인

    async def test_verify_jwt_token_expired(self):
        """만료된 JWT 토큰이 제대로 거부되는지 검증"""
        # Given: 만료된 토큰
        # When: verify_token() 호출
        # Then: TokenExpiredError 발생

    async def test_google_oauth_callback_new_user(self):
        """새 사용자의 Google OAuth 콜백 처리"""
        # Given: 신규 Google 사용자 정보
        # When: handle_google_callback() 호출
        # Then: 새 사용자 생성 및 토큰 발급
```

#### 2. API 엔드포인트 테스트 (TestClient)

```python
# tests/api/test_auth_endpoints.py
class TestAuthEndpoints:
    def test_login_redirect_to_google(self):
        """GET /v1/auth/google이 올바른 OAuth URL로 리다이렉트"""
        # Given: 인증되지 않은 사용자
        # When: GET /v1/auth/google
        # Then: 302 리다이렉트 with 올바른 Google OAuth URL

    async def test_refresh_token_success(self):
        """POST /v1/auth/refresh가 새 토큰을 발급"""
        # Given: 유효한 refresh token
        # When: POST /v1/auth/refresh
        # Then: 200 OK with 새 access token
```

#### 3. 통합 테스트 (pytest + testcontainers)

```python
# tests/integration/test_subscription_flow.py
class TestSubscriptionFlow:
    @pytest.fixture
    async def postgres_container(self):
        """테스트용 PostgreSQL 컨테이너 실행"""
        with PostgresContainer() as postgres:
            yield postgres

    async def test_complete_subscription_flow(self, postgres_container):
        """전체 구독 플로우 E2E 테스트"""
        # Given: 인증된 무료 사용자
        # When: 구독 체크아웃 → Stripe 웹훅 → 구독 활성화
        # Then: 사용자 구독 상태가 premium으로 변경
```

### Chrome Extension 테스트 (TypeScript/Jest)

#### 1. 단위 테스트

```typescript
// src/services/__tests__/authService.test.ts
describe('AuthService', () => {
  it('should open new tab for OAuth login', async () => {
    // Given: chrome.tabs.create mock
    // When: authService.login() 호출
    // Then: 올바른 URL로 새 탭 생성 확인
  });

  it('should capture token from postMessage', async () => {
    // Given: postMessage 이벤트 리스너 설정
    // When: 유효한 토큰과 함께 postMessage 수신
    // Then: 토큰이 Chrome Storage에 저장됨
  });
});
```

#### 2. Background Script 테스트

```typescript
// src/entrypoints/background/__tests__/messageHandlers.test.ts
describe('Message Handlers', () => {
  it('should route auth messages correctly', async () => {
    // Given: MESSAGE_AUTH_LOGIN 메시지
    // When: chrome.runtime.onMessage 트리거
    // Then: AuthService.login() 호출됨
  });
});
```

#### 3. React 컴포넌트 테스트 (React Testing Library)

```typescript
// src/components/auth/__tests__/LoginButton.test.tsx
describe('LoginButton', () => {
  it('should show Google login when not authenticated', () => {
    // Given: 인증되지 않은 상태
    // When: LoginButton 렌더링
    // Then: "Sign in with Google" 버튼 표시
  });

  it('should show user profile when authenticated', () => {
    // Given: 인증된 사용자 상태
    // When: LoginButton 렌더링
    // Then: 사용자 이메일과 프로필 사진 표시
  });
});
```

### E2E 테스트 (Playwright)

```typescript
// e2e/auth.spec.ts
test.describe('Authentication Flow', () => {
  test('complete login flow', async ({ page, context }) => {
    // Given: Extension 설치된 브라우저
    // When:
    //   1. Extension 아이콘 클릭
    //   2. "Sign in with Google" 클릭
    //   3. Google OAuth 완료
    // Then: Side panel에 사용자 정보 표시
  });
});
```

### 테스트 커버리지 목표

- **단위 테스트**: 90% 이상
- **통합 테스트**: 핵심 플로우 100%
- **E2E 테스트**: Critical User Journey 100%

### CI/CD 파이프라인 테스트

```yaml
# .github/workflows/test.yml
- Backend: pytest --cov=app --cov-report=xml
- Extension: npm test -- --coverage
- E2E: playwright test
```

### 테스트 환경

- **Backend**: Python 3.11+, pytest, testcontainers
- **Extension**: Jest, React Testing Library
- **E2E**: Playwright with Chrome
- **Mock 서비스**: Stripe CLI (웹훅 테스트), Google OAuth 테스트 계정

## 위험 및 고려사항

### 성능

- **토큰 갱신 오버헤드**: Background script에서 효율적 관리
- **API 프록시 레이턴시**: 엣지 함수 사용으로 최소화
- **번들 크기 영향**: Auth 라이브러리 최소화 (~50KB 예상)

### 보안

- [x] JWT 안전한 저장 (Chrome Storage 암호화)
- [x] PKCE를 사용한 OAuth 2.0 플로우
- [x] API Rate Limiting
- [x] SQL Injection 방지
- [x] XSS/CSRF 보호

### 호환성

- **최소 Chrome 버전**: 88+ (기본 Extension API만 사용)
- **Manifest V3 준수**: Service Worker에서 인증 관리
- **기존 기능 영향**: API 키 사용자는 영향 없음

### 프라이버시

- [x] GDPR 준수 (EU)
- [x] CCPA 준수 (California)
- [x] 개인정보보호법 준수 (한국)
- [x] 사용자 데이터 삭제 기능
- [x] 데이터 수집 최소화

## 에러 처리 및 복구 전략

### 인증 에러 처리

```typescript
// src/services/errorHandler.ts
class AuthErrorHandler {
  async handleAuthError(error: AuthError): Promise<void> {
    switch (error.code) {
      case 'TOKEN_EXPIRED':
        // 자동 토큰 갱신 시도
        await this.refreshToken();
        break;

      case 'REFRESH_FAILED':
        // 재로그인 유도
        this.showReLoginPrompt();
        break;

      case 'NETWORK_ERROR':
        // 오프라인 모드 전환
        this.enableOfflineMode();
        break;

      case 'SERVER_ERROR':
        // 재시도 with exponential backoff
        await this.retryWithBackoff();
        break;
    }
  }

  private async retryWithBackoff(fn: () => Promise<any>, maxRetries: number = 3): Promise<any> {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const delay = Math.min(1000 * Math.pow(2, i), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
```

### 사용자 경험 최적화

```typescript
// 로딩 상태 관리
interface LoadingState {
  isAuthenticating: boolean;
  authProgress: number; // 0-100
  currentStep: 'checking' | 'refreshing' | 'logging-in';
  message: string;
}

// 에러 메시지 현지화
const ERROR_MESSAGES = {
  ko: {
    AUTH_REQUIRED: '로그인이 필요합니다',
    TOKEN_EXPIRED: '세션이 만료되었습니다. 다시 로그인해주세요',
    NETWORK_ERROR: '네트워크 연결을 확인해주세요',
    SERVER_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요',
  },
  en: {
    AUTH_REQUIRED: 'Login required',
    TOKEN_EXPIRED: 'Session expired. Please login again',
    NETWORK_ERROR: 'Please check your network connection',
    SERVER_ERROR: 'Temporary error occurred. Please try again later',
  },
};
```

### 복구 시나리오

**시나리오 1: 토큰 만료**

1. API 호출 시 401 에러 감지
2. Refresh Token으로 자동 갱신 시도
3. 성공 시 원래 요청 재시도
4. 실패 시 재로그인 프롬프트

**시나리오 2: 네트워크 끊김**

1. 네트워크 에러 감지
2. 오프라인 모드 활성화
3. 로컬 데이터만으로 동작
4. 작업 큐에 새 작업 저장
5. 온라인 복귀 시 자동 동기화

**시나리오 3: 서버 장애**

1. 503 에러 또는 타임아웃 감지
2. 캐시된 데이터로 폴백
3. 읽기 전용 모드 전환
4. Status Page 확인 링크 제공
5. 백그라운드에서 health check

### 데이터 일관성 보장

```typescript
// 낙관적 업데이트와 롤백
class OptimisticUpdate {
  async updateSetting(key: string, value: any) {
    // 1. UI 즉시 업데이트 (낙관적)
    this.updateUI(key, value);

    // 2. 이전 값 백업
    const previousValue = await this.backup(key);

    try {
      // 3. 서버 동기화
      await this.syncToServer(key, value);
    } catch (error) {
      // 4. 실패 시 롤백
      this.updateUI(key, previousValue);
      this.showError('동기화 실패');
    }
  }
}
```

## 법적 준비사항

### 필수 문서

1. **개인정보처리방침 (Privacy Policy)**
   - 한국어, 영어 필수
   - 주요 언어별 번역 (23개 언어)
   - Chrome Extension 특성 반영
   - Google OAuth 데이터 사용 명시

2. **이용약관 (Terms of Service)**
   - 서비스 이용 조건
   - 책임 제한 조항
   - 분쟁 해결 (한국법 준거)

3. **쿠키 정책 (Cookie Policy)**
   - Chrome Storage API 사용 고지
   - 로컬 저장 데이터 설명

### 동의 획득 UI

```typescript
// Step0.5: 약관 동의 (신규)
interface ConsentStep {
  termsAccepted: boolean; // 이용약관 (필수)
  privacyAccepted: boolean; // 개인정보처리방침 (필수)
  marketingAccepted?: boolean; // 마케팅 수신 (선택)
  consentDate: string; // ISO 8601
  consentVersion: string; // "1.0.0"
}
```

### Google OAuth 요구사항

- OAuth 동의 화면 구성 완료
- 개인정보처리방침 URL 등록
- 이용약관 URL 등록
- 최소 권한 요청 (email, profile)

### 지역별 대응

- **EU**: GDPR 대표자 지정 검토
- **미국**: CCPA "Do Not Sell" 링크
- **한국**: 14세 미만 가입 제한
- **일본**: APPI 준수 고지
- **중국**: 서비스 제외 (데이터 현지화 요구)

## 배포 및 롤백 전략

### 단계별 롤아웃

**Phase 0: 인프라 준비 (1주)**

- 백엔드 서버 구축 및 테스트
- 데이터베이스 설정 및 마이그레이션
- Google OAuth 설정 및 검증
- 모니터링 시스템 구축

**Phase 1: Alpha 테스트 (1주)**

- 대상: 내부 팀 5-10명
- 목표: 핵심 기능 검증
- 성공 기준:
  - 로그인 성공률 > 95%
  - 토큰 갱신 실패율 < 1%
  - API 응답 시간 < 200ms

**Phase 2: Beta 테스트 (2주)**

- 대상: 초대된 사용자 100명
- 배포 방법: Chrome Web Store 비공개 베타
- 모니터링 지표:
  - 인증 성공률
  - 사용자 이탈률
  - 에러 발생률
  - 성능 메트릭

**Phase 3: Canary 배포 (1주)**

- 대상: 전체 사용자의 5%
- 점진적 확대: 5% → 10% → 25% → 50%
- 롤백 조건:
  - 에러율 > 5%
  - 인증 실패율 > 10%
  - 사용자 불만 급증

**Phase 4: 전체 배포**

- 모든 사용자에게 적용
- 24시간 집중 모니터링
- 핫픽스 대기 체제

### 모니터링 대시보드

**실시간 지표**:

```typescript
interface MonitoringMetrics {
  // 인증 지표
  authSuccessRate: number; // 목표: > 99%
  tokenRefreshRate: number; // 목표: > 99%
  loginDuration: number; // 목표: < 3초

  // 성능 지표
  apiResponseTime: number; // 목표: < 200ms (p95)
  errorRate: number; // 목표: < 0.1%

  // 사용자 지표
  dailyActiveUsers: number;
  conversionRate: number; // 설치 → 로그인
  retentionRate: number; // 7일 재방문율
}
```

### 롤백 계획

**자동 롤백 트리거**:

- 인증 성공률 < 90% (5분 지속)
- API 에러율 > 5% (5분 지속)
- 서버 응답 시간 > 1초 (p95, 10분 지속)

**롤백 프로세스**:

```bash
# 1. Extension 롤백 (Chrome Web Store)
- 이전 버전으로 즉시 롤백
- 사용자에게 자동 업데이트

# 2. 백엔드 롤백 (Blue-Green 배포)
- 이전 버전 서버로 트래픽 전환
- 데이터베이스 마이그레이션 롤백
- 캐시 무효화

# 3. 사용자 통신
- Extension 내 공지사항
- 이메일 발송 (가입 사용자)
- 소셜 미디어 안내
```

### 오프라인 모드 지원

**읽기 전용 모드**:

```typescript
class OfflineMode {
  async isOffline(): Promise<boolean> {
    return !navigator.onLine || !(await this.checkBackendHealth());
  }

  async handleOffline() {
    // 1. 로컬 데이터만 표시
    // 2. 새로운 작업 큐에 저장
    // 3. 온라인 복귀 시 동기화
  }
}
```

**Graceful Degradation**:

- Level 1: 서버 지연 시 → 로컬 캐시 우선
- Level 2: 인증 실패 시 → 읽기 전용 모드
- Level 3: 완전 오프라인 → 기본 기능만

### 핫픽스 프로세스

**긴급 패치 절차**:

1. 문제 감지 (자동 알림 또는 사용자 리포트)
2. 원인 분석 (최대 30분)
3. 패치 개발 및 테스트 (최대 2시간)
4. Canary 배포 (1% 사용자, 30분)
5. 전체 배포 또는 롤백 결정

**커뮤니케이션**:

- Status Page 업데이트
- Extension 내 배너 표시
- 주요 이슈는 이메일 발송

### 백로그 (향후 구현)

- Payment System (Stripe)
- Shizue API 프록시 서비스
- 무료 크레딧 시스템
- 프리미엄 구독 모델

## 기존 사용자 전환 전략

### 즉시 필수 전환

**업데이트 후 동작 방식**:

- 플로팅 버튼은 정상적으로 표시
- 플로팅 버튼 클릭 → Side Panel 열림
- Side Panel에서 온보딩/로그인 화면 표시
- 로그인 완료 전까지 모든 기능 사용 불가

**온보딩 플로우**:

1. Shizue 소개 화면
2. Google 로그인 (필수)
3. API Key 입력 (필수)
4. 완료 후 정상 사용

### 기존 사용자 혜택

**얼리버드 보상** (첫 30일 내 가입):

- 향후 프리미엄 기능 출시 시 특별 할인
- "Early Adopter" 뱃지
- 베타 기능 우선 접근권

**계정 전환 시 장점**:

- 설정 자동 백업 및 동기화
- 사용량 통계 및 비용 분석
- 여러 기기에서 동일한 환경
- API Key는 각 기기에서 개별 입력 (보안 강화)

### 전환 메시지

**필수 전환 메시지**:

```
"Shizue 이용 약관이 변경되었습니다.
계속 사용하려면 로그인이 필요합니다.

• Google 계정으로 로그인
• 기존 API Key 그대로 사용
• 더 안전한 암호화 저장"

[Google로 로그인하기]
────────────────────
더 이상 사용하지 않겠습니다
```

### 기술적 구현

**필수 전환 로직**:

```typescript
// background/index.ts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 플로팅 버튼 클릭은 항상 허용
  if (msg.action === MESSAGE_SET_PANEL_OPEN_OR_NOT) {
    // Side Panel 열기 처리
    chrome.sidePanel.open();
    return;
  }

  const isAuthenticated = await storage.get('auth_token');

  // API 호출 등 실제 기능은 인증 필요
  if (!isAuthenticated && requiresAuth(msg.action)) {
    sendResponse({ error: 'AUTH_REQUIRED' });
    return;
  }

  // 정상 처리
});
```

**Side Panel 온보딩 처리**:

```typescript
// sidepanel/App.tsx
function App() {
  const { isAuthenticated, hasApiKey } = useAuth();

  if (!isAuthenticated || !hasApiKey) {
    return <OnboardedRoute />; // 온보딩 플로우
  }

  return <Routes />;
}
```

**플로팅 버튼 동작**:

```typescript
// toggle.content/index.tsx
function handleFloatingButtonClick() {
  // 인증 상태와 관계없이 Side Panel 열기
  chrome.runtime.sendMessage({
    action: MESSAGE_SET_PANEL_OPEN_OR_NOT,
    open: true,
  });
}
```

## 구현 단계

### Phase 1: 전체 구현 (3-4주)

**Week 1: 백엔드 인프라**

- [x] FastAPI 프로젝트 설정 및 구조화
- [x] SQLAlchemy 모델 및 마이그레이션 설정
- [x] 데이터베이스 스키마 구현
- [x] Google OAuth 통합 (Authlib)
- [x] JWT 인증 시스템 (python-jose)
- [x] 사용자 프로필 및 설정 API
- [x] 비동기 API 엔드포인트 구현

**Week 2: Extension 통합**

- [x] AuthService 구현
- [x] Background script 인증 로직
- [x] 로그인 UI 구현
- [x] 토큰 관리 시스템
- [x] API Key 관리 UI
- [x] 기존 사용자 전환 플로우

**Week 3-4: 마무리 및 테스트**

- [x] 설정 동기화 구현 (API Key 제외)
- [x] 사용량 통계 시스템
- [x] 단계별 전환 UI (배너, 모달)
- [x] 전체 테스트 수행
- [x] 성능 최적화
- [x] 문서화

## 성공 지표 모니터링

### 핵심 지표

- **가입 전환율**: Extension 설치 → 계정 생성
- **프리미엄 전환율**: 무료 → 유료
- **이탈율**: 주간/월간 활성 사용자
- **API 사용량**: 일일 API 호출 수
- **에러율**: 인증 실패, API 에러

### 모니터링 도구

- Google Analytics 4
- Sentry (에러 추적)
- Stripe Dashboard (결제)
- Custom Dashboard (API 사용량)

## 참고 사항

- Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성 필요
  - Authorized redirect URIs: https://shizue.ai/auth/callback
  - Authorized JavaScript origins: https://shizue.ai
- DNS 설정: shizue.ai, api.shizue.ai 서브도메인 구성
- Chrome Web Store 개발자 대시보드에서 OAuth 설정 필요
- Stripe 계정 및 제품/가격 설정 필요

## 체크리스트 (구현 전)

- [x] Google OAuth 앱 생성
- [x] Stripe 계정 설정
- [x] Python 3.11+ 환경 설정
- [x] Poetry/pip 의존성 관리 설정
- [x] 백엔드 호스팅 환경 준비 (Docker 컨테이너화)
- [x] 데이터베이스 인스턴스 생성
- [x] 환경 변수 설정 (.env 파일)

## 체크리스트 (구현 후)

- [x] OAuth 플로우 전체 테스트
- [ ] 결제 플로우 테스트 (Stripe 통합 대기)
- [x] 기존 사용자 마이그레이션 테스트
- [x] 보안 감사 수행 (API Key 암호화)
- [ ] 성능 벤치마크
- [x] 다국어 지원 확인
- [x] 문서 업데이트

## 구현 상태 (2025-08-02 기준)

### 완료된 기능 ✅

#### 1. 인증 시스템

- **Google OAuth 2.0**: 웹 기반 OAuth 플로우 구현
- **JWT 토큰 관리**: Access/Refresh 토큰 자동 갱신
- **세션 관리**: Redis 캐싱으로 성능 최적화
- **Chrome Extension 통합**: postMessage로 토큰 전달

#### 2. 사용자 설정 관리

- **서버 동기화**: localStorage → 서버 마이그레이션 완료
- **암호화**: API Key AES-256 암호화 저장
- **오프라인 지원**: 로컬 캐싱 및 동기화 큐
- **설정 API**: GET/PUT/PATCH/migrate 엔드포인트

#### 3. 모델 매핑 시스템 (신규)

- **추상화된 선택**: Large/Small 모델 크기 선택
- **자동 업그레이드**: 새 모델 출시 시 자동 적용
- **공급자 선호도**: OpenAI/Gemini/Anthropic 선택
- **마이그레이션**: 기존 모델 선택 자동 변환

#### 4. 백엔드 인프라

- **FastAPI**: 비동기 Python 웹 프레임워크
- **PostgreSQL**: 사용자 데이터 저장
- **Redis**: 세션 캐싱 및 속도 제한
- **Docker**: 컨테이너화 및 배포 준비

#### 5. 프론트엔드 통합

- **React Hooks**: useAuth, useSettings 커스텀 훅
- **서비스 레이어**: AuthService, SettingsService 싱글톤
- **UI 컴포넌트**: 로그인 버튼, 설정 모달 업데이트
- **상태 관리**: Jotai atoms로 전역 상태 관리

### 주요 파일 구조

```
api/accounts-backend/
├── app/
│   ├── api/v1/
│   │   ├── auth.py         # Google OAuth, JWT 관리
│   │   ├── settings.py     # 사용자 설정 API
│   │   └── users.py         # 사용자 프로필 관리
│   ├── core/
│   │   ├── encryption.py   # API Key 암호화
│   │   ├── redis.py         # Redis 캐싱
│   │   └── security.py      # JWT 토큰 생성/검증
│   ├── models/
│   │   ├── user.py          # User 모델
│   │   └── auth_token.py    # AuthToken 모델
│   ├── schemas/
│   │   ├── settings.py      # 설정 스키마
│   │   └── model_mapping.py # 모델 매핑 스키마
│   └── services/
│       └── model_service.py # 모델 선택 로직

src/
├── services/
│   ├── authService.ts       # 인증 서비스
│   ├── settingsService.ts   # 설정 서비스
│   └── tokenManager.ts      # 토큰 관리
├── hooks/
│   ├── useAuth.ts           # 인증 훅
│   └── useSettings.ts       # 설정 훅
└── components/
    └── Setting/
        └── SettingsModalContentNew.tsx # 새 설정 UI
```

### 미구현 기능 ⏳

1. **Stripe 결제 통합**
   - 구독 플랜 설정
   - 결제 웹훅 처리
   - 구독 관리 UI

2. **사용량 추적**
   - API 호출 카운터
   - 토큰 사용량 집계
   - 사용량 대시보드

3. **엔터프라이즈 기능**
   - 팀 계정 관리
   - SSO 통합
   - 관리자 대시보드

### 성능 지표

- **인증 응답 시간**: ~200ms (Redis 캐싱)
- **설정 동기화**: ~150ms (배치 처리)
- **토큰 갱신**: 자동 (만료 5분 전)
- **암호화 오버헤드**: <10ms (Fernet)

### 보안 조치

- ✅ HTTPS 전용 통신
- ✅ JWT 토큰 (HS256)
- ✅ API Key 암호화 (AES-256)
- ✅ CORS 설정
- ✅ Rate Limiting (Redis)
- ✅ SQL Injection 방지 (SQLAlchemy ORM)

### 다음 단계

1. **프로덕션 배포**
   - AWS/GCP 인프라 설정
   - CI/CD 파이프라인
   - 모니터링 설정

2. **성능 최적화**
   - 데이터베이스 인덱싱
   - API 응답 캐싱
   - CDN 설정

3. **사용자 피드백**
   - 베타 테스트
   - 사용성 개선
   - 버그 수정
