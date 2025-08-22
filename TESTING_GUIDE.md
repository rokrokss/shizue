# ACCOUNTS 구현 로컬 테스트 가이드

## 🚀 빠른 시작

### 1. 환경 준비

#### 1.1 백엔드 환경변수 설정

```bash
cd api/accounts-backend
cp .env.example .env
# .env 파일 편집하여 Google OAuth 정보 입력
```

#### 1.2 Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. OAuth 2.0 클라이언트 ID 생성
3. 승인된 리디렉션 URI: `http://localhost:8000/v1/auth/callback/google`
4. 클라이언트 ID와 시크릿을 `.env`에 추가

### 2. 서비스 실행

#### 2.1 백엔드 실행

```bash
# Docker로 DB 실행
docker-compose up -d postgres

# 백엔드 서버 실행
source ../.venv/bin/activate
uvicorn app.main:app --reload

# API 문서 확인: http://localhost:8000/docs
```

#### 2.2 Extension 실행

```bash
# 프로젝트 루트에서
pnpm build

# Chrome에서:
# 1. chrome://extensions 접속
# 2. 개발자 모드 활성화
# 3. "압축해제된 확장 프로그램을 로드합니다" 클릭
# 4. dist/chrome-mv3/ 폴더 선택
```

### 3. 테스트 시나리오

#### 3.1 인증 플로우 테스트

1. Extension 아이콘 클릭 → 사이드 패널 열림
2. 온보딩 화면에서 "Google로 로그인" 클릭
3. Google OAuth 완료
4. API Key 입력 (최소 하나)
5. 완료 후 메인 화면 진입

#### 3.2 API Key 관리 테스트

1. 설정 페이지에서 API Key 추가/수정
2. 서버 동기화 확인 (pgAdmin에서 DB 확인)
3. 다른 브라우저에서 로그인 시 설정 동기화 확인

#### 3.3 로그아웃 테스트

1. 설정에서 로그아웃
2. 모든 로컬 데이터 삭제 확인
3. 재로그인 테스트

## 🔧 최적화 권장사항

### 1. 중복 코드 제거

**문제**: `useLanguage`, `useTheme` 등이 여러 파일에서 중복 export
**해결**:

- `src/hooks/language.ts`, `src/hooks/models.ts`, `src/hooks/layout.ts`에서 중복 함수 제거
- `src/hooks/useSettings.ts`의 통합 버전만 사용

### 2. 번들 크기 최적화

**현재**: 전체 8.44MB (sidepanel 2.52MB)
**권장사항**:

- 동적 import로 코드 분할
- 사용하지 않는 라이브러리 제거
- Tree shaking 최적화

### 3. 성능 최적화

- Token 캐싱 전략 개선
- API 호출 배치 처리
- 불필요한 re-render 방지

### 4. 보안 강화

- API Key 암호화 확인
- XSS 방지 검증
- CSRF 토큰 구현 고려

## 🐛 디버깅 팁

### Chrome Extension 디버깅

- 백그라운드 스크립트: chrome://extensions → 서비스 워커 검사
- 사이드 패널: 우클릭 → 검사
- 네트워크 요청: DevTools Network 탭

### 백엔드 디버깅

```bash
# 로그 확인
tail -f api/accounts-backend/server.log

# DataGrip으로 DB 연결
# PostgreSQL: localhost:5432, DB: shizue_accounts, User: shizue, Password: shizue_password
```

## 📊 성능 모니터링

### 메트릭 수집 포인트

1. 인증 응답 시간
2. API 호출 빈도
3. 토큰 갱신 주기
4. 에러 발생률

### 권장 임계값

- 인증 응답: < 200ms
- API 응답: < 500ms
- 에러율: < 0.1%
