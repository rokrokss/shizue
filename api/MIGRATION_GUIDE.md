# Python Backend Workspace Migration Guide

이 가이드는 기존 개별 Python 백엔드 프로젝트를 uv workspace 기반의 통합 구조로 마이그레이션하는 방법을 설명합니다.

## 변경 사항 요약

1. **Python 버전**: 모든 백엔드가 Python 3.12로 통일됨
2. **의존성 관리**: requirements.txt → pyproject.toml + uv workspace
3. **디렉토리 구조**: 개별 프로젝트가 workspace 멤버로 통합됨

## 새로운 구조

```
api/
├── .python-version           # Python 3.12
├── pyproject.toml           # 루트 workspace 설정
├── accounts-backend/
│   └── pyproject.toml       # 프로젝트별 설정
└── pdf-translation/
    └── pyproject.toml       # 프로젝트별 설정
```

## 개발 환경 설정

### 1. uv 설치

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. 의존성 설치

```bash
cd api/

# workspace 전체 의존성 설치
uv sync --all-groups

# 개별 프로젝트를 editable 모드로 설치
uv pip install -e accounts-backend
uv pip install -e pdf-translation
```

### 3. 개발 서버 실행

```bash
# accounts-backend 실행
cd accounts-backend
uv run uvicorn app.main:app --reload --port 8000

# pdf-translation 실행  
cd ../pdf-translation
uv run python main_server.py
```

## 주요 명령어

### 코드 포맷팅
```bash
# 전체 프로젝트
cd api/
uv run black .
uv run isort .

# 개별 프로젝트
uv run black accounts-backend/
uv run isort accounts-backend/
```

### 테스트 실행
```bash
# accounts-backend 테스트
cd api/accounts-backend
uv run pytest

# pdf-translation 테스트
cd ../pdf-translation
uv run pytest
```

### 타입 체크
```bash
cd api/
uv run mypy accounts-backend/app/
uv run mypy pdf-translation/
```

## 기존 venv에서 마이그레이션

```bash
# 기존 venv 제거
rm -rf venv/

# uv로 새로운 환경 설정
cd api/
uv sync --all-groups
```

## 새로운 의존성 추가

### 공통 의존성 추가
```bash
cd api/
uv add package-name
```

### 프로젝트별 의존성 추가
```bash
# accounts-backend 전용
cd api/
uv add package-name --group accounts

# pdf-translation 전용  
uv add package-name --group pdf
```

## 주의사항

1. **Python 버전**: 반드시 Python 3.12를 사용해야 합니다
2. **의존성 충돌**: override-dependencies로 버전 충돌이 해결됩니다
3. **CI/CD**: GitHub Actions가 uv를 사용하도록 업데이트되었습니다

## 문제 해결

### uv sync 실패 시
```bash
# 캐시 삭제 후 재시도
uv cache clean
uv sync --all-groups
```

### Import 에러 발생 시
```bash
# editable 설치 확인
uv pip install -e accounts-backend
uv pip install -e pdf-translation
```

### 타입 에러 발생 시
```bash
# mypy 캐시 삭제
rm -rf .mypy_cache/
uv run mypy --install-types
```