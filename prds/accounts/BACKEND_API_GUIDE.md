# Shizue Accounts Backend API 문서

## 📋 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [빠른 시작](#빠른-시작)
3. [아키텍처](#아키텍처)
4. [API 엔드포인트](#api-엔드포인트)
5. [환경 설정](#환경-설정)
6. [개발 가이드](#개발-가이드)
7. [테스트](#테스트)
8. [배포](#배포)
9. [문제 해결](#문제-해결)

## 프로젝트 개요

Shizue Accounts Backend는 Chrome 확장 프로그램 Shizue의 사용자 인증 및 설정 관리를 담당하는 FastAPI 기반 백엔드 서버입니다.

### 주요 기능
- 🔐 **Google OAuth 2.0 인증**: 안전한 사용자 로그인
- 🔑 **JWT 토큰 관리**: Access/Refresh 토큰 자동 갱신
- ⚙️ **설정 동기화**: 여러 기기 간 설정 동기화
- 🔒 **API Key 암호화**: AES-256 암호화로 안전한 저장
- 🤖 **모델 매핑**: AI 모델 자동 업그레이드 시스템
- 📊 **사용량 추적**: API 사용량 모니터링

## 빠른 시작

### 1. 요구사항
- Python 3.11+
- PostgreSQL 또는 SQLite (개발용)
- UV (패키지 매니저)

### 2. 설치 및 실행

```bash
# 프로젝트 디렉토리로 이동
cd api/accounts-backend

# 가상환경 생성 및 활성화
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 의존성 설치
uv pip install -r requirements.txt

# 환경 변수 설정 (.env 파일 생성)
cp .env.example .env
# .env 파일 편집하여 필요한 값 설정

# 데이터베이스 마이그레이션
alembic upgrade head

# 개발 서버 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. API 문서 확인
서버 실행 후 브라우저에서:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 아키텍처

### 디렉토리 구조
```
accounts-backend/
├── app/
│   ├── api/              # API 라우터
│   │   ├── v1/          # v1 API 엔드포인트
│   │   │   ├── auth.py  # 인증 관련
│   │   │   ├── settings.py # 설정 관리
│   │   │   └── users.py # 사용자 프로필
│   │   └── health.py    # 헬스체크
│   ├── core/            # 핵심 설정 및 유틸리티
│   │   ├── config.py    # 환경 설정
│   │   ├── database.py  # DB 연결
│   │   ├── security.py  # JWT, 암호화
│   │   └── cache.py     # 캐싱 로직
│   ├── models/          # SQLAlchemy 모델
│   ├── schemas/         # Pydantic 스키마
│   ├── services/        # 비즈니스 로직
│   └── repositories/    # 데이터 접근 계층
├── tests/               # 테스트 코드
├── alembic/            # DB 마이그레이션
└── docker-compose.yml  # Docker 설정
```

### 기술 스택
- **Framework**: FastAPI (비동기 웹 프레임워크)
- **ORM**: SQLAlchemy 2.0 (비동기 지원)
- **Validation**: Pydantic v2
- **Authentication**: JWT (python-jose)
- **OAuth**: Authlib
- **Encryption**: cryptography (Fernet)
- **Testing**: pytest + pytest-asyncio

## API 엔드포인트

### 인증 (Authentication)

#### Google OAuth 로그인
```http
GET /v1/auth/login/google
```
Google OAuth 로그인 URL을 반환합니다.

**응답 예시:**
```json
{
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

#### OAuth 콜백 처리
```http
GET /v1/auth/callback/google?code={auth_code}
```
Google OAuth 콜백을 처리하고 JWT 토큰을 발급합니다.

**응답 예시:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "profile_picture": "https://..."
  }
}
```

#### 토큰 갱신
```http
POST /v1/auth/refresh
Authorization: Bearer {refresh_token}
```

#### 로그아웃
```http
POST /v1/auth/logout
Authorization: Bearer {access_token}
```

### 설정 관리 (Settings)

#### 설정 조회
```http
GET /v1/settings
Authorization: Bearer {access_token}
```

#### 설정 업데이트
```http
PATCH /v1/settings
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "general": {
    "language": "Korean"
  }
}
```

#### API Key 관리
```http
POST /v1/settings/api-keys
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "provider": "openai",
  "key": "sk-..."
}
```

**응답:**
```json
{
  "provider": "openai",
  "maskedKey": "sk-...abcd",
  "validated": true
}
```

#### 모델 목록 조회
```http
GET /v1/settings/models?size=large&provider=openai
Authorization: Bearer {access_token}
```

### 사용자 정보

#### 프로필 조회
```http
GET /v1/users/me
Authorization: Bearer {access_token}
```

#### 사용량 통계
```http
GET /v1/usage/stats
Authorization: Bearer {access_token}
```

## 환경 설정

### 필수 환경 변수 (.env)
```bash
# 데이터베이스
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/shizue
# 개발용 SQLite: sqlite+aiosqlite:///./test.db

# JWT 설정
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/v1/auth/callback/google

# Chrome Extension
CHROME_EXTENSION_ID=your-extension-id
CHROME_EXTENSION_REDIRECT_URI=https://your-extension-id.chromiumapp.org/

# 암호화 키 (Fernet)
ENCRYPTION_KEY=your-fernet-key-here

# 환경 설정
DEBUG=true
ENVIRONMENT=development
```

### 암호화 키 생성
```python
from cryptography.fernet import Fernet
key = Fernet.generate_key()
print(key.decode())  # .env의 ENCRYPTION_KEY에 사용
```

## 개발 가이드

### 코드 스타일
프로젝트는 다음 도구를 사용합니다:
- **black**: 코드 포매팅
- **isort**: import 정렬
- **flake8**: 린팅
- **mypy**: 타입 체킹

```bash
# 코드 포매팅
black app/
isort app/

# 린팅
flake8 app/

# 타입 체킹
mypy app/
```

### 데이터베이스 마이그레이션

```bash
# 새 마이그레이션 생성
alembic revision --autogenerate -m "Add new table"

# 마이그레이션 적용
alembic upgrade head

# 롤백
alembic downgrade -1
```

### 새 엔드포인트 추가

1. **스키마 정의** (`app/schemas/`)
```python
from pydantic import BaseModel

class NewFeatureRequest(BaseModel):
    name: str
    value: str

class NewFeatureResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
```

2. **API 라우터 추가** (`app/api/v1/`)
```python
from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user

router = APIRouter()

@router.post("/new-feature")
async def create_feature(
    request: NewFeatureRequest,
    user = Depends(get_current_user)
):
    # 구현
    pass
```

3. **main.py에 라우터 등록**
```python
from app.api.v1 import new_feature

app.include_router(
    new_feature.router,
    prefix="/v1/new-feature",
    tags=["new-feature"]
)
```

## 테스트

### 테스트 실행
```bash
# 모든 테스트 실행
pytest

# 커버리지 포함
pytest --cov=app --cov-report=html

# 특정 테스트만 실행
pytest tests/test_auth_api.py -v
```

### 테스트 작성 예시
```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    response = await client.get("/v1/auth/login/google")
    assert response.status_code == 200
    assert "authorization_url" in response.json()
```

## 배포

### Docker 사용

```bash
# 이미지 빌드
docker build -t shizue-accounts-backend .

# 컨테이너 실행
docker run -p 8000:8000 --env-file .env shizue-accounts-backend
```

### Docker Compose

```bash
# 개발 환경
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# 프로덕션
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 프로덕션 체크리스트
- [ ] 환경 변수 설정 확인
- [ ] 데이터베이스 백업 설정
- [ ] SSL/TLS 인증서 설정
- [ ] 로그 수집 설정
- [ ] 모니터링 설정 (Prometheus/Grafana)
- [ ] Rate limiting 설정
- [ ] CORS 설정 확인

## 문제 해결

### 자주 발생하는 문제

#### 1. ModuleNotFoundError
```bash
# 해결: 의존성 재설치
uv pip install -r requirements.txt
```

#### 2. 데이터베이스 연결 실패
```bash
# PostgreSQL 상태 확인
pg_isready -h localhost -p 5432

# SQLite 사용 (개발용)
DATABASE_URL=sqlite+aiosqlite:///./test.db
```

#### 3. JWT 토큰 오류
```bash
# 새 시크릿 키 생성
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

#### 4. Google OAuth 오류
- Google Cloud Console에서 리다이렉트 URI 확인
- 클라이언트 ID/Secret 확인
- OAuth 동의 화면 설정 확인

### 로그 확인
```bash
# 애플리케이션 로그
tail -f logs/app.log

# 에러 로그
tail -f logs/error.log

# Docker 로그
docker-compose logs -f app
```

### 유용한 명령어
```bash
# 포트 사용 확인
lsof -i :8000

# 프로세스 종료
kill -9 $(lsof -t -i:8000)

# 데이터베이스 초기화
alembic downgrade base
alembic upgrade head

# 캐시는 자동으로 메모리에서 관리됨
```

## 연락처 및 지원

- **이슈 트래커**: GitHub Issues
- **문서**: `/docs` 디렉토리
- **API 문서**: http://localhost:8000/docs

---

*이 문서는 Shizue Accounts Backend API v1.0 기준으로 작성되었습니다.*
