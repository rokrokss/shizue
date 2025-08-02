# Shizue 계정 시스템 설계 문서

## 1. 시스템 아키텍처

### 1.1 전체 구조 (3-Tier Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                         │
├─────────────────────┬───────────────────┬───────────────────┤
│  Background Script  │    Side Panel     │  Content Scripts  │
│  (Service Worker)   │   (React App)     │  (Page Injection) │
│                     │                   │                   │
│ • Token Manager     │ • Login UI        │ • Auth Status     │
│ • API Router        │ • Profile View    │ • Floating Button │
│ • Message Handler   │ • Settings Sync   │                   │
└─────────────────────┴───────────────────┴───────────────────┘
                               ↕
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                          │
│                  (FastAPI Backend)                           │
├─────────────────────┬───────────────────┬───────────────────┤
│    API Gateway      │   Auth Service    │   User Service    │
│ • Rate Limiting     │ • Google OAuth    │ • Profile Mgmt    │
│ • CORS Policy       │ • JWT Management  │ • Settings Sync   │
│ • Request Routing   │ • Token Refresh   │ • Usage Tracking  │
└─────────────────────┴───────────────────┴───────────────────┘
                               ↕
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                               │
├─────────────────────┬───────────────────┬───────────────────┤
│    PostgreSQL       │      Redis        │  Chrome Storage   │
│ • User Data         │ • Session Cache   │ • API Keys        │
│ • Usage Stats       │ • Rate Limits     │ • UI Settings     │
│ • Auth Tokens       │ • User Profiles   │ • Token Cache     │
└─────────────────────┴───────────────────┴───────────────────┘
```

### 1.2 데이터 흐름

#### 인증 플로우
```
User → Side Panel → Background Script → New Tab (OAuth)
                                              ↓
                                       Google OAuth 2.0
                                              ↓
                                    Backend API (Callback)
                                              ↓
                                        JWT Token 발급
                                              ↓
                            Chrome Storage ← Background Script
                                              ↓
                                        Update UI State
```

#### API 호출 플로우
```
Chat Request → chatService → Background Script
                                    ↓
                            Token Manager (검증)
                                    ↓
                        [Shizue API Mode]    [User Key Mode]
                               ↓                    ↓
                    Backend API + JWT      Direct LLM Provider
                               ↓                    ↓
                        Streaming Response ← ← ← ← ←
```

## 2. 데이터베이스 설계

### 2.1 테이블 구조

#### users 테이블
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    profile_picture VARCHAR(500),
    locale VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
```

#### user_settings 테이블
```sql
CREATE TABLE user_settings (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);
```

#### api_usage 테이블
```sql
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    model VARCHAR(100) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_total INTEGER GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,
    latency_ms INTEGER,
    status_code INTEGER,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user_created ON api_usage(user_id, created_at DESC);
CREATE INDEX idx_api_usage_model ON api_usage(model, created_at DESC);
```

#### auth_tokens 테이블
```sql
CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) UNIQUE NOT NULL,
    device_id VARCHAR(100),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, revoked_at);
```

## 3. API 설계

### 3.1 인증 API

```yaml
# Google OAuth 시작
POST /v1/auth/google/authorize
Response:
  {
    "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?..."
  }

# OAuth 콜백 처리
POST /v1/auth/google/callback
Body:
  {
    "code": "string",
    "state": "string"
  }
Response:
  {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in": 3600,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "profile_picture": "https://..."
    }
  }

# 토큰 갱신
POST /v1/auth/refresh
Headers:
  Authorization: Bearer {refresh_token}
Response:
  {
    "access_token": "eyJ...",
    "expires_in": 3600
  }

# 로그아웃
POST /v1/auth/logout
Headers:
  Authorization: Bearer {access_token}
Response:
  {
    "success": true
  }

# 현재 사용자 정보
GET /v1/auth/me
Headers:
  Authorization: Bearer {access_token}
Response:
  {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "profile_picture": "https://...",
    "created_at": "2025-01-01T00:00:00Z"
  }
```

### 3.2 사용자 설정 API

```yaml
# 설정 조회
GET /v1/settings
Headers:
  Authorization: Bearer {access_token}
Response:
  {
    "theme": "dark",
    "language": "ko",
    "target_language": "en",
    "ui_preferences": {...}
  }

# 설정 업데이트
PUT /v1/settings/{key}
Headers:
  Authorization: Bearer {access_token}
Body:
  {
    "value": any
  }
Response:
  {
    "key": "theme",
    "value": "dark"
  }
```

### 3.3 사용량 추적 API

```yaml
# 사용량 통계 조회
GET /v1/usage/stats
Headers:
  Authorization: Bearer {access_token}
Query:
  - start_date: "2025-01-01" (ISO 8601)
  - end_date: "2025-01-31" (ISO 8601)
  - group_by: "day" | "week" | "month"
Response:
  {
    "total_tokens": 150000,
    "total_requests": 450,
    "by_model": {
      "gpt-4": {
        "tokens": 80000,
        "requests": 200,
        "cost_estimate": 2.4
      },
      "claude-3": {
        "tokens": 70000,
        "requests": 250,
        "cost_estimate": 1.75
      }
    },
    "timeline": [
      {
        "date": "2025-01-01",
        "tokens": 5000,
        "requests": 15
      }
    ]
  }

# 사용량 기록
POST /v1/usage/track
Headers:
  Authorization: Bearer {access_token}
Body:
  {
    "model": "gpt-4",
    "tokens_input": 500,
    "tokens_output": 1000,
    "latency_ms": 1200,
    "metadata": {
      "feature": "chat",
      "thread_id": "..."
    }
  }
```

### 3.4 에러 응답 형식

```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Access token has expired",
    "details": {
      "expired_at": "2025-01-01T12:00:00Z"
    },
    "request_id": "req_123456"
  }
}
```

## 4. 보안 설계

### 4.1 JWT 토큰 전략

#### Access Token
- **수명**: 1시간
- **페이로드**:
  ```json
  {
    "user_id": "uuid",
    "email": "user@example.com",
    "exp": 1234567890,
    "iat": 1234567890
  }
  ```
- **용도**: API 요청 인증

#### Refresh Token
- **수명**: 30일 (슬라이딩 윈도우)
- **저장**: 데이터베이스에 해시값 저장
- **용도**: Access Token 갱신

### 4.2 보안 계층

1. **HTTPS 전용** - TLS 1.3 이상 강제
2. **CORS 정책**
   ```python
   allowed_origins = [
       "chrome-extension://YOUR_EXTENSION_ID",
       "https://shizue.ai",
       "http://localhost:3000"  # 개발 환경
   ]
   ```
3. **Rate Limiting**
   - 인증 API: 5회/분
   - 일반 API: 100회/분 (사용자당)
   - 토큰 갱신: 10회/시간
4. **입력 검증** - Pydantic 모델 사용
5. **SQL Injection 방지** - SQLAlchemy ORM 사용

### 4.3 Chrome Extension 보안

```typescript
// 토큰 저장 전략
class SecureTokenStorage {
  // Chrome Storage는 자체 암호화 제공
  async saveTokens(tokens: AuthTokens) {
    await chrome.storage.local.set({
      'auth_token': tokens.access_token,
      'refresh_token': tokens.refresh_token,
      'token_expiry': Date.now() + (tokens.expires_in * 1000)
    });
  }

  // 메모리 캐싱으로 성능 최적화
  private tokenCache = new Map<string, CachedToken>();

  async getValidToken(): Promise<string> {
    // 1. 메모리 캐시 확인
    // 2. Chrome Storage 확인
    // 3. 필요시 자동 갱신
  }
}
```

## 5. Chrome Extension 통합

### 5.1 OAuth 플로우 구현

```typescript
// src/services/authService.ts
class AuthService {
  private authTabId: number | null = null;

  async login(): Promise<AuthTokens> {
    // 1. 새 탭에서 OAuth 시작
    const { url } = await fetch('https://api.shizue.ai/v1/auth/google/authorize')
      .then(res => res.json());

    const tab = await chrome.tabs.create({ url });
    this.authTabId = tab.id;

    // 2. 토큰 수신 대기
    return this.waitForToken();
  }

  private async waitForToken(): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      // URL 변경 감지
      chrome.tabs.onUpdated.addListener(function listener(tabId, info, tab) {
        if (tabId === this.authTabId &&
            info.url?.includes('shizue.ai/auth/success')) {
          const urlParams = new URLSearchParams(new URL(info.url).search);
          const token = urlParams.get('token');
          const refreshToken = urlParams.get('refresh_token');

          chrome.tabs.remove(tabId);
          chrome.tabs.onUpdated.removeListener(listener);

          resolve({
            access_token: token!,
            refresh_token: refreshToken!,
            expires_in: 3600
          });
        }
      });

      // 30초 타임아웃
      setTimeout(() => reject(new Error('Auth timeout')), 30000);
    });
  }
}
```

### 5.2 Service Worker 토큰 관리

```typescript
// src/services/tokenManager.ts
class TokenManager {
  private refreshPromise: Promise<string> | null = null;
  private tokenCache: Map<string, TokenInfo> = new Map();

  async getValidToken(): Promise<string> {
    // 1. 메모리 캐시 확인
    const cached = this.getCachedToken();
    if (cached && !this.isExpiringSoon(cached)) {
      return cached.token;
    }

    // 2. Chrome Storage 확인
    const stored = await this.getStoredToken();
    if (stored && !this.isExpiringSoon(stored)) {
      this.cacheToken(stored);
      return stored.token;
    }

    // 3. 토큰 갱신 (Race condition 방지)
    return this.refreshWithSingleton();
  }

  private isExpiringSoon(token: TokenInfo): boolean {
    const BUFFER_TIME = 5 * 60 * 1000; // 5분
    return token.expiry < Date.now() + BUFFER_TIME;
  }

  private async refreshWithSingleton(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh()
        .finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<string> {
    const stored = await chrome.storage.local.get(['refresh_token']);
    if (!stored.refresh_token) {
      throw new Error('No refresh token');
    }

    const response = await fetch('https://api.shizue.ai/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stored.refresh_token}`
      }
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const { access_token, expires_in } = await response.json();

    await this.saveToken(access_token, expires_in);
    return access_token;
  }
}
```

### 5.3 Background Script 메시지 라우팅

```typescript
// src/entrypoints/background/authHandler.ts
const AUTH_REQUIRED_ACTIONS = new Set([
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_RUN_GRAPH_STREAM,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
  MESSAGE_CONTEXT_MENU_SUMMARIZE_PAGE
]);

export async function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender
): Promise<any> {
  // 인증이 필요한 액션인지 확인
  if (AUTH_REQUIRED_ACTIONS.has(message.action)) {
    try {
      const token = await tokenManager.getValidToken();
      // 인증된 요청 처리
      return await processAuthenticatedRequest(message, token);
    } catch (error) {
      // 인증 실패 시 Side Panel 열어서 로그인 유도
      await chrome.sidePanel.open({ windowId: sender.tab?.windowId });
      return {
        error: 'AUTH_REQUIRED',
        needsLogin: true
      };
    }
  }

  // 인증 불필요한 요청 처리
  return processPublicRequest(message);
}
```

## 6. 성능 최적화

### 6.1 캐싱 전략

#### Redis 캐싱
```python
# 캐시 키 패턴
user:profile:{user_id}        # TTL: 1시간
usage:stats:{user_id}:{date}  # TTL: 5분
rate:api:{user_id}            # TTL: 슬라이딩 윈도우
```

#### Chrome Extension 캐싱
```typescript
interface AuthCache {
  isAuthenticated: boolean;
  userInfo: UserProfile;
  checkedAt: number;
  ttl: number; // 5분
}

// 인증 상태 캐싱으로 불필요한 API 호출 방지
class AuthStateCache {
  private cache: AuthCache | null = null;

  async checkAuthStatus(): Promise<boolean> {
    if (this.cache && this.isValid(this.cache)) {
      return this.cache.isAuthenticated;
    }

    const status = await this.verifyWithBackend();
    this.updateCache(status);
    return status.isAuthenticated;
  }
}
```

### 6.2 성능 최적화 기법

1. **Connection Pooling**
   ```python
   # PostgreSQL 연결 풀
   DATABASE_URL = "postgresql+asyncpg://user:pass@host/db"
   engine = create_async_engine(
       DATABASE_URL,
       pool_size=20,
       max_overflow=10,
       pool_pre_ping=True
   )
   ```

2. **배치 처리**
   ```typescript
   // 사용량 추적 배치 처리
   class UsageTracker {
     private queue: UsageData[] = [];
     private timer: NodeJS.Timeout | null = null;

     track(data: UsageData) {
       this.queue.push(data);
       this.scheduleBatch();
     }

     private scheduleBatch() {
       if (!this.timer) {
         this.timer = setTimeout(() => {
           this.flush();
           this.timer = null;
         }, 10000); // 10초
       }
     }
   }
   ```

3. **인덱스 최적화**
   - 자주 조회되는 컬럼에 인덱스 추가
   - 복합 인덱스로 쿼리 성능 향상
   - 파티셔닝으로 대용량 데이터 관리

## 7. 구현 가이드

### 7.1 백엔드 구현 순서 (Week 1)

1. **프로젝트 초기화**
   ```bash
   poetry new shizue-backend
   cd shizue-backend
   poetry add fastapi uvicorn[standard] sqlalchemy asyncpg redis authlib python-jose[cryptography] pydantic-settings
   ```

2. **Docker Compose 설정**
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: postgres:15
       environment:
         POSTGRES_DB: shizue
         POSTGRES_USER: shizue
         POSTGRES_PASSWORD: secure_password
       ports:
         - "5432:5432"

     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
   ```

3. **기본 구조 생성**
   ```
   backend/
   ├── app/
   │   ├── api/v1/
   │   ├── core/
   │   ├── models/
   │   ├── services/
   │   └── main.py
   ├── alembic/
   ├── tests/
   └── docker-compose.yml
   ```

### 7.2 Extension 구현 순서 (Week 2)

1. **신규 서비스 생성**
   - `authService.ts` - OAuth 플로우
   - `tokenManager.ts` - 토큰 관리
   - `apiRoutingService.ts` - API 라우팅

2. **컴포넌트 구현**
   - `LoginButton.tsx` - Google 로그인 UI
   - `UserProfile.tsx` - 프로필 표시
   - `AuthGuard.tsx` - 인증 보호

3. **기존 코드 수정**
   - Background Script에 인증 핸들러 추가
   - Side Panel에 AuthProvider 래핑
   - 온보딩 플로우 재설계

### 7.3 마이그레이션 전략 (Week 3)

1. **기존 사용자 감지**
   ```typescript
   async function detectExistingUser() {
     const storage = await chrome.storage.local.get([
       'STORAGE_OPENAI_API_KEY',
       'STORAGE_ANTHROPIC_API_KEY',
       'STORAGE_GEMINI_API_KEY'
     ]);

     return Object.values(storage).some(key => !!key);
   }
   ```

2. **단계별 롤아웃**
   - Alpha: 내부 팀 테스트
   - Beta: 5% 사용자
   - Canary: 25% → 50% → 100%

3. **모니터링 지표**
   - 인증 성공률 > 99%
   - API 응답시간 < 200ms
   - 에러율 < 0.1%

## 8. 체크리스트

### 백엔드 구현
- [ ] Google OAuth 2.0 설정
- [ ] JWT 인증 시스템 구현
- [ ] 데이터베이스 스키마 생성
- [ ] API 엔드포인트 구현
- [ ] Redis 캐싱 설정
- [ ] Rate Limiting 구현
- [ ] 로깅 및 모니터링
- [ ] 단위/통합 테스트

### Chrome Extension 구현
- [ ] AuthService 구현
- [ ] TokenManager 구현
- [ ] 로그인 UI 컴포넌트
- [ ] Background Script 수정
- [ ] 온보딩 플로우 개선
- [ ] 기존 사용자 마이그레이션
- [ ] 에러 처리 및 복구
- [ ] E2E 테스트

### 보안 및 성능
- [ ] HTTPS 설정
- [ ] CORS 정책 구현
- [ ] 토큰 자동 갱신
- [ ] 캐싱 전략 구현
- [ ] 성능 모니터링
- [ ] 보안 감사

## 9. 주요 결정 사항

1. **웹 기반 OAuth 선택**
   - chrome.identity API 대신 웹 기반 OAuth 사용
   - 더 많은 제어권과 유연성 확보
   - 향후 다른 OAuth 제공자 추가 용이

2. **JWT + Refresh Token**
   - Access Token: 1시간 (보안)
   - Refresh Token: 30일 (UX)
   - 자동 갱신으로 사용자 불편 최소화

3. **하이브리드 저장 전략**
   - API Key: 로컬 저장 (프라이버시)
   - 계정 정보: 서버 저장 (동기화)
   - 사용자가 데이터 위치 제어 가능

4. **즉시 필수 전환**
   - 기존 사용자도 계정 생성 필수
   - 단계적 전환 대신 즉시 전환
   - 명확한 가치 제공으로 전환율 향상

5. **3-Tier 아키텍처**
   - 확장 가능한 구조
   - 각 계층 독립적 확장
   - 마이크로서비스로 전환 가능

이 설계를 바탕으로 안정적이고 확장 가능한 계정 시스템을 구현할 수 있습니다.
