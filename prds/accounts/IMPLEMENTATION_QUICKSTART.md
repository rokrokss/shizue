# Shizue 계정 시스템 구현 빠른 시작 가이드

## 🚀 빠른 시작 (30분 안에 시작하기)

### 1. 백엔드 초기 설정 (10분)

```bash
# 프로젝트 생성
mkdir shizue-backend && cd shizue-backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install fastapi uvicorn[standard] sqlalchemy asyncpg redis authlib python-jose[cryptography] pydantic-settings alembic

# 프로젝트 구조 생성
mkdir -p app/{api/v1,core,models,services}
touch app/__init__.py app/main.py
```

### 2. Docker로 DB/Redis 실행 (5분)

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: shizue
      POSTGRES_USER: shizue
      POSTGRES_PASSWORD: shizue123
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  postgres_data:
```

```bash
docker-compose up -d
```

### 3. 환경 설정 파일 (5분)

```python
# app/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 데이터베이스
    DATABASE_URL: str = "postgresql+asyncpg://shizue:shizue123@localhost/shizue"
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    JWT_SECRET_KEY: str = "your-secret-key-change-this"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Google OAuth
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str = "https://api.shizue.ai/v1/auth/google/callback"

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "chrome-extension://YOUR_EXTENSION_ID",
        "http://localhost:3000"
    ]

    class Config:
        env_file = ".env"

settings = Settings()
```

### 4. 기본 FastAPI 앱 (10분)

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(
    title="Shizue API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# 라우터 등록 (나중에 추가)
# app.include_router(auth_router, prefix="/v1/auth", tags=["auth"])
```

```bash
# 서버 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 📝 핵심 구현 파일들

### 1. JWT 토큰 관리 (backend)

```python
# app/core/security.py
from datetime import datetime, timedelta
from jose import JWTError, jwt
from app.core.config import settings

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(datetime.UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(datetime.UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
```

### 2. Google OAuth 처리 (backend)

```python
# app/services/google_oauth.py
from authlib.integrations.starlette_client import OAuth
from app.core.config import settings

oauth = OAuth()
oauth.register(
    name='google',
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    }
)

async def get_google_user(token):
    async with oauth.google.authorize_access_token(token) as resp:
        user_info = await resp.json()
    return user_info
```

### 3. Chrome Extension AuthService

```typescript
// src/services/authService.ts
export class AuthService {
  private static instance: AuthService;
  private authTabId: number | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async login(): Promise<AuthTokens> {
    // 1. 백엔드에서 OAuth URL 가져오기
    const response = await fetch('https://api.shizue.ai/v1/auth/google/authorize');
    const { authorization_url } = await response.json();

    // 2. 새 탭에서 OAuth 시작
    const tab = await chrome.tabs.create({ url: authorization_url });
    this.authTabId = tab.id;

    // 3. 콜백 대기
    return this.waitForCallback();
  }

  private waitForCallback(): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 60000); // 1분 타임아웃

      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === this.authTabId && info.url?.includes('/auth/success')) {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);

          const url = new URL(info.url);
          const tokens = {
            access_token: url.searchParams.get('access_token')!,
            refresh_token: url.searchParams.get('refresh_token')!,
            expires_in: parseInt(url.searchParams.get('expires_in')!),
          };

          chrome.tabs.remove(tabId);
          resolve(tokens);
        }
      });
    });
  }

  async logout(): Promise<void> {
    const { access_token } = await chrome.storage.local.get('access_token');

    if (access_token) {
      await fetch('https://api.shizue.ai/v1/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
    }

    await chrome.storage.local.remove([
      'access_token',
      'refresh_token',
      'token_expiry',
      'user_info',
    ]);
  }
}
```

### 4. Token Manager (Extension)

```typescript
// src/services/tokenManager.ts
export class TokenManager {
  private static instance: TokenManager;
  private tokenCache: Map<string, TokenInfo> = new Map();
  private refreshPromise: Promise<string> | null = null;

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  async getValidToken(): Promise<string> {
    // 1. 메모리 캐시 확인
    const cached = this.tokenCache.get('access_token');
    if (cached && cached.expiry > Date.now() + 300000) {
      // 5분 버퍼
      return cached.token;
    }

    // 2. Storage 확인
    const stored = await chrome.storage.local.get(['access_token', 'token_expiry']);
    if (stored.access_token && stored.token_expiry > Date.now() + 300000) {
      this.tokenCache.set('access_token', {
        token: stored.access_token,
        expiry: stored.token_expiry,
      });
      return stored.access_token;
    }

    // 3. 토큰 갱신
    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    // 동시 요청 방지
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

  private async doRefresh(): Promise<string> {
    const { refresh_token } = await chrome.storage.local.get('refresh_token');

    if (!refresh_token) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://api.shizue.ai/v1/auth/refresh', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${refresh_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const { access_token, expires_in } = await response.json();
    const expiry = Date.now() + expires_in * 1000;

    await chrome.storage.local.set({
      access_token: access_token,
      token_expiry: expiry,
    });

    this.tokenCache.set('access_token', { token: access_token, expiry });

    return access_token;
  }
}
```

### 5. Background Script 통합

```typescript
// src/entrypoints/background/messageHandlers.ts
import { TokenManager } from '../../services/tokenManager';

const tokenManager = TokenManager.getInstance();

// 인증이 필요한 액션들
const AUTH_REQUIRED_ACTIONS = new Set([
  MESSAGE_TRANSLATE_HTML_TEXT_BATCH,
  MESSAGE_RUN_GRAPH_STREAM,
  MESSAGE_CONTEXT_MENU_TRANSLATE_PAGE,
]);

export async function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): Promise<boolean> {
  try {
    // 인증 확인
    if (AUTH_REQUIRED_ACTIONS.has(message.action)) {
      try {
        const token = await tokenManager.getValidToken();
        // 토큰을 헤더에 추가하여 요청 처리
        message.authToken = token;
      } catch (error) {
        // 인증 실패 - Side Panel 열어서 로그인 유도
        await chrome.sidePanel.open({ windowId: sender.tab?.windowId });
        sendResponse({ error: 'AUTH_REQUIRED', needsLogin: true });
        return true;
      }
    }

    // 기존 메시지 처리 로직
    const result = await processMessage(message);
    sendResponse(result);
  } catch (error) {
    sendResponse({ error: error.message });
  }

  return true; // 비동기 응답
}

chrome.runtime.onMessage.addListener(handleMessage);
```

### 6. React 로그인 컴포넌트

```tsx
// src/components/auth/LoginButton.tsx
import { useAuth } from '../../hooks/useAuth';
import { Button, Avatar, Dropdown } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';

export function LoginButton() {
  const { isAuthenticated, user, login, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <Button type="primary" icon={<UserOutlined />} onClick={login}>
        Google로 로그인
      </Button>
    );
  }

  const menuItems = [
    {
      key: 'profile',
      label: user?.email,
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      label: '로그아웃',
      icon: <LogoutOutlined />,
      onClick: logout,
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight">
      <Avatar src={user?.profile_picture} icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
    </Dropdown>
  );
}
```

## 🔥 즉시 실행 가능한 명령어

### Backend 실행

```bash
# 1. 환경 변수 설정
cat > .env << EOF
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
JWT_SECRET_KEY=$(openssl rand -hex 32)
EOF

# 2. DB 마이그레이션
alembic init alembic
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head

# 3. 서버 실행
uvicorn app.main:app --reload
```

### Extension 실행

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정
echo "VITE_API_URL=http://localhost:8000" > .env.local

# 3. 개발 모드 실행
pnpm dev

# 4. 빌드
pnpm build
```

## 📋 체크리스트

### Day 1 - 기본 설정

- [ ] Google Cloud Console에서 OAuth 2.0 클라이언트 생성
- [ ] 백엔드 프로젝트 생성 및 Docker 실행
- [ ] 기본 API 엔드포인트 생성 (/health)
- [ ] CORS 설정 확인

### Day 2 - 인증 구현

- [ ] JWT 토큰 생성/검증 구현
- [ ] Google OAuth 콜백 처리
- [ ] 사용자 테이블 생성 및 저장
- [ ] Refresh Token 로직 구현

### Day 3 - Extension 통합

- [ ] AuthService 구현
- [ ] TokenManager 구현
- [ ] Background Script 수정
- [ ] 로그인 UI 구현

### Day 4 - 테스트 및 마무리

- [ ] E2E 인증 플로우 테스트
- [ ] 에러 처리 구현
- [ ] 기존 사용자 마이그레이션 로직
- [ ] 성능 최적화

## 🚨 주의사항

1. **Google OAuth 설정**
   - Authorized redirect URIs에 `http://localhost:8000/v1/auth/google/callback` 추가
   - Chrome Extension ID를 정확히 설정

2. **보안**
   - JWT_SECRET_KEY는 반드시 변경
   - HTTPS 사용 필수 (프로덕션)
   - CORS origins 정확히 설정

3. **Extension Manifest**
   ```json
   {
     "host_permissions": ["https://api.shizue.ai/*", "http://localhost:8000/*"]
   }
   ```

이 가이드를 따라 30분 안에 기본 구조를 갖춘 계정 시스템을 시작할 수 있습니다!
