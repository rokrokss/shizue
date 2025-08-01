# Shizue Accounts Backend API

백엔드 API for Shizue Chrome Extension 계정 시스템.

## 🚀 빠른 시작 (저예산 배포)

### 옵션 1: Railway (무료, 가장 쉬움)
```bash
# Railway CLI 설치
npm install -g @railway/cli

# 배포
railway login
railway init
railway up
```

### 옵션 2: Docker Compose (VPS용)
```bash
# 환경 변수 설정
cp .env.production.example .env.production
nano .env.production

# 배포
./scripts/deploy.sh
```

자세한 내용은 [저예산 배포 가이드](../../deploy/BUDGET_DEPLOYMENT_GUIDE.md)를 참조하세요.

## 기능

- Google OAuth 2.0 인증
- JWT 토큰 기반 인증
- 사용자 프로필 관리
- API 사용량 추적
- Redis 캐싱
- PostgreSQL 데이터베이스

## 필요 사항

- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (권장)

## 빠른 시작

### Docker를 사용한 실행 (권장)

1. 환경 변수 설정:
```bash
cp .env.example .env
# .env 파일을 편집하여 필요한 값 설정
```

2. 서비스 시작:
```bash
make up-dev  # 개발 환경
# 또는
docker-compose up -d  # 프로덕션 환경
```

3. 데이터베이스 마이그레이션:
```bash
make migrate
```

### 로컬 개발 환경

1. 가상 환경 생성:
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

2. 의존성 설치:
```bash
pip install -r requirements.txt
```

3. 환경 변수 설정:
```bash
cp .env.example .env
# .env 파일 편집
```

4. 데이터베이스 및 Redis 시작:
```bash
docker-compose up -d postgres redis
```

5. 애플리케이션 실행:
```bash
uvicorn app.main:app --reload
```

## API 문서

개발 환경에서는 다음 URL에서 API 문서를 확인할 수 있습니다:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 주요 엔드포인트

### 인증
- `GET /v1/auth/login/google` - Google OAuth 로그인 URL 가져오기
- `GET /v1/auth/callback/google` - Google OAuth 콜백 처리
- `POST /v1/auth/refresh` - 액세스 토큰 갱신
- `POST /v1/auth/logout` - 로그아웃

### 사용자
- `GET /v1/users/me` - 현재 사용자 프로필
- `PATCH /v1/users/me` - 프로필 업데이트
- `GET /v1/users/me/stats` - 사용 통계
- `DELETE /v1/users/me` - 계정 삭제

### 사용량
- `POST /v1/usage/` - 사용량 기록
- `GET /v1/usage/` - 사용 내역 조회
- `GET /v1/usage/summary` - 사용량 요약
- `GET /v1/usage/models` - 모델별 사용량

## 개발

### 테스트 실행
```bash
make test
```

### 로그 확인
```bash
make logs  # 모든 서비스
make logs-api  # API만
```

### 데이터베이스 마이그레이션
```bash
# 새 마이그레이션 생성
make migrate-create

# 마이그레이션 적용
make migrate

# 마이그레이션 롤백
make migrate-down
```

## 프로덕션 배포

1. SSL 인증서를 `ssl/` 디렉토리에 추가
2. `.env` 파일에 프로덕션 설정
3. Docker Compose로 실행:
```bash
docker-compose --profile production up -d
```

## 환경 변수

주요 환경 변수 목록은 `.env.example` 파일을 참조하세요.

## 라이선스

이 프로젝트는 Shizue Chrome Extension의 일부입니다.