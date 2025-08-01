# CLAUDE.md

이 파일은 이 저장소의 코드 작업 시 Claude Code (claude.ai/code)에게 가이드를 제공합니다.

## 프로젝트 개요

Shizue는 대규모 언어 모델(LLM)을 웹 브라우징에 통합하는 Chrome 확장 프로그램입니다. Sider와 같은 상용 서비스의 무료 오픈소스 대안으로, 사용자가 OpenAI, Anthropic Claude, Google Gemini에 대한 자체 API 키를 사용할 수 있습니다.

## 개발 명령어

```bash
pnpm dev              # 핫 리로딩이 있는 개발 모드
pnpm build            # 프로덕션 빌드
pnpm zip              # 배포용 ZIP 생성
pnpm compile          # TypeScript 타입 체크
```

### 확장 프로그램 테스트
1. 빌드: `pnpm build`
2. `chrome://extensions` 접속
3. "개발자 모드" 활성화
4. "압축해제된 확장 프로그램을 로드합니다" 클릭 → `dist/chrome-mv3/` 선택

### 디버깅
- **백그라운드 스크립트**: chrome://extensions → 서비스 워커 → 검사
- **사이드 패널**: 패널 우클릭 → 검사
- **콘텐츠 스크립트**: 일반 페이지 DevTools

### API 서버용 Python 환경
- **Python 버전**: API 서버들은 `.venv/bin/activate`로 활성화되는 가상환경의 Python을 사용합니다
- **활성화**: `source .venv/bin/activate` (`api/accounts-backend/` 또는 `api/pdf-translation/`에서)
- **패키지 매니저**: 의존성 관리를 위한 `uv`

## 아키텍처

### 상위 수준 컴포넌트 아키텍처
```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome 확장 프로그램                        │
├─────────────────────┬───────────────────┬───────────────────┤
│  백그라운드 스크립트   │    사이드 패널      │  콘텐츠 스크립트    │
│  (서비스 워커)        │   (React 앱)       │  (페이지 주입)      │
├─────────────────────┼───────────────────┼───────────────────┤
│ • 메시지 라우터       │ • 채팅 UI          │ • 토글 버튼        │
│ • API 관리          │ • PDF 번역기        │ • YouTube 자막     │
│ • 컨텍스트 메뉴       │ • 메모/노트         │ • 페이지 오버레이    │
│ • 상태 동기화        │ • 설정             │ • 번역 UI          │
└─────────────────────┴───────────────────┴───────────────────┘
```

### 컴포넌트 통신 흐름
1. **Chrome 런타임 메시지**가 모든 컴포넌트 간 조정
2. **포트 연결**이 실시간 기능(채팅, 번역)을 위한 데이터 스트리밍
3. **저장소 이벤트**가 컴포넌트 간 설정 동기화
4. **백그라운드 스크립트**가 중앙 메시지 라우터 및 상태 조정자 역할

### 핵심 기술
- **WXT** - 핫 리로드가 있는 웹 확장 프레임워크
- **React 19** + TypeScript + Tailwind CSS v4 + Ant Design
- **LangChain** - OpenAI, Anthropic, Google 모델을 위한 통합 인터페이스
- **Jotai** - 원자적 상태 관리
- **Dexie** - 스레드, 메시지, 메모를 위한 IndexedDB 래퍼

### 핵심 컴포넌트 및 책임

**백그라운드 서비스 워커** (`src/entrypoints/background/index.ts`)
- 모든 컴포넌트 간 통신을 처리하는 중앙 메시지 라우터
- 컨텍스트 메뉴 관리 (번역, 요약, 이미지 OCR)
- API 키 검증 및 저장
- 사이드 패널 라이프사이클 제어

**사이드 패널 React 앱** (`src/entrypoints/sidepanel/`)
- 라우트: `/` (채팅), `/shizue-pdf`, `/shizue-memo`, `/onboarding`
- 스레드 관리가 있는 스트리밍 채팅
- 레이아웃을 보존하는 PDF 번역
- 자동 저장 및 고정 기능이 있는 메모 시스템

**콘텐츠 스크립트**
- `toggle.content` - 플로팅 버튼 + 오버레이 메뉴
- `youtube-caption-toggle.content` - 실시간 자막 번역

### 중요한 다중 파일 패턴

**메시지 흐름 패턴**
```
사용자 액션 → 콘텐츠 스크립트 → 백그라운드 스크립트 → 사이드 패널
                                    ↓
                              Chrome 저장소
```

**서비스 아키텍처**
- `services/chatService.ts` - LLM 스트리밍, 스레드 관리
- `services/translationService.ts` - 배치 번역, 포맷 보존
- `services/background/messageHandlers.ts` - 중앙 메시지 처리
- `services/background/chatModelHandler.ts` - 모델 생성, 스트리밍

**상태 관리 레이어**
1. **Jotai Atoms** (`hooks/global.ts`) - UI 상태, 현재 스레드
2. **Chrome 저장소** - API 키, 설정, 환경설정
3. **IndexedDB** (`lib/indexDB.ts`) - 스레드, 메시지, 메모

## 주요 메시지 타입 및 저장소

### 중요한 메시지 액션 (`src/config/constants.ts`)
```typescript
MESSAGE_SET_PANEL_OPEN_OR_NOT    // 사이드 패널 토글
MESSAGE_TRANSLATE_HTML_TEXT_BATCH // 포맷팅이 있는 배치 번역
MESSAGE_CONTEXT_MENU_*           // 컨텍스트 메뉴 액션:
  - TRANSLATE_PAGE               // 전체 페이지 번역
  - SUMMARIZE_PAGE               // AI 페이지 요약
  - DESCRIBE_IMAGE               // 이미지 설명
  - EXTRACT_IMAGE_TEXT           // OCR 텍스트 추출
```

### 저장소 키 패턴
```typescript
STORAGE_*_KEY                    // API 키 (OpenAI, Gemini, Anthropic)
STORAGE_*_MODEL                  // 선택된 모델
STORAGE_*_VALIDATED              // API 키 검증 상태
STORAGE_USER_MEMORY              // AI를 위한 사용자 컨텍스트
STORAGE_PDF_TRANSLATE_TASK_INFO  // PDF 번역 상태
```

## 핵심 기능

### 1. 스트리밍이 있는 AI 채팅
- **모델**: GPT-4.1, Gemini 2.5 Flash, Claude Sonnet 4
- **스트리밍**: 백그라운드 스크립트와의 포트 연결을 통해
- **스레드 관리**: Dexie를 사용한 IndexedDB 저장소

### 2. 이중 언어 번역
- **오버레이**: 포맷을 보존하는 나란히 번역
- **배치 처리**: 효율적인 DOM 조작
- **컨텍스트 메뉴**: 우클릭으로 모든 페이지 번역

### 3. PDF 번역
- **라이브러리**: 구조 보존을 위한 pdf-lib
- **WASM 지원**: 성능을 위해 CSP에서 활성화
- **라우트**: 사이드 패널의 `/shizue-pdf`

### 4. YouTube 자막 번역
- **실시간**: 자막이 나타날 때 번역
- **캐싱**: 반복된 콘텐츠에 대한 API 호출 감소
- **키보드 네비게이션**: 선택적 YouTube 단축키

### 5. 메모 시스템
- **기능**: 자동 저장, 고정, 검색
- **저장소**: Chrome 저장소와 동기화되는 IndexedDB
- **라우트**: 사이드 패널의 `/shizue-memo`

### 6. 컨텍스트 메뉴 액션
- 페이지 번역/요약
- AI로 이미지 설명
- 이미지에서 텍스트 추출 (OCR)

## 빌드 및 성능

### 번들 최적화
- **시각화**: `pnpm build` → `dist/stats.html` 확인
- **트리 쉐이킹**: Rollup을 통해 활성화
- **축소**: 주석 제거와 함께 Terser
- **소스 맵**: 프로덕션에서 비활성화

### 콘텐츠 보안 정책
```javascript
// wxt.config.ts
content_security_policy: {
  extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
}
```

### 국제화
- **언어**: 23개 지원 (ar, bn, de, en, es, fr, ja, ko, zh_CN 등)
- **모듈**: 동적 전환이 있는 `@wxt-dev/i18n`
- **파일**: `src/locales/*.json`

# 중요한 지시사항 알림
요청된 것만 수행하고, 그 이상도 그 이하도 하지 마세요.
목표 달성에 절대적으로 필요한 경우가 아니면 파일을 생성하지 마세요.
항상 새 파일을 생성하는 것보다 기존 파일을 편집하는 것을 선호하세요.
사용자가 명시적으로 요청하지 않는 한 문서 파일(*.md)이나 README 파일을 사전에 생성하지 마세요.


      중요: 이 컨텍스트는 작업과 관련이 있을 수도 있고 없을 수도 있습니다. 작업과 매우 관련이 있는 경우에만 이 컨텍스트에 응답해야 합니다.
