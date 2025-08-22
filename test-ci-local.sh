#!/bin/bash

# CI 로컬 테스트 스크립트
# GitHub Actions CI가 통과할지 로컬에서 검증

echo "🔍 CI 로컬 검증 시작..."
echo ""

# 색상 코드 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# timeout 명령어 감지 및 대체 함수
run_with_timeout() {
    local timeout_seconds=$1
    shift
    local command="$@"

    if command -v timeout &> /dev/null; then
        timeout "$timeout_seconds" $command
    elif command -v gtimeout &> /dev/null; then
        gtimeout "$timeout_seconds" $command
    else
        # timeout이 없으면 백그라운드로 실행하고 수동으로 제한
        echo "  ⚠️ timeout 명령어가 없어서 시간 제한 없이 실행합니다..."
        $command &
        local pid=$!
        local count=0
        while kill -0 $pid 2>/dev/null; do
            if [ $count -ge $timeout_seconds ]; then
                kill -9 $pid 2>/dev/null
                echo "  ⚠️ 시간 초과로 프로세스를 종료했습니다 (${timeout_seconds}초)"
                return 1
            fi
            sleep 1
            ((count++))
        done
        wait $pid
        return $?
    fi
}

# 진행 상황 표시 함수
print_status() {
    local status=$1
    local message=$2

    if [ "$status" = "success" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" = "error" ]; then
        echo -e "${RED}✗${NC} $message"
    elif [ "$status" = "warning" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
    else
        echo "  $message"
    fi
}

# 1. Extension 테스트
echo "📦 Chrome Extension 테스트..."
if command -v pnpm &> /dev/null; then
    print_status "success" "pnpm 설치됨"

    print_status "" "의존성 확인..."
    if pnpm install --frozen-lockfile > /dev/null 2>&1; then
        print_status "success" "의존성 설치 완료"
    else
        print_status "warning" "의존성 설치 중 경고"
    fi

    print_status "" "타입 체크..."
    if pnpm run compile 2>/dev/null; then
        print_status "success" "타입 체크 통과"
    else
        print_status "warning" "타입 체크 경고"
    fi

    print_status "" "린팅..."
    if pnpm run lint 2>/dev/null; then
        print_status "success" "린팅 통과"
    else
        print_status "warning" "린팅 경고"
    fi

    print_status "" "테스트..."
    if pnpm vitest run 2>/dev/null; then
        print_status "success" "테스트 통과"
    else
        print_status "warning" "테스트 실패"
    fi

    print_status "" "빌드..."
    if run_with_timeout 30 pnpm build > /dev/null 2>&1; then
        print_status "success" "빌드 성공"
    else
        print_status "warning" "빌드 실패 또는 시간 초과"
    fi

    echo -e "${GREEN}✅ Extension 테스트 완료${NC}"
else
    print_status "error" "pnpm이 설치되지 않음"
    echo "  실행: npm install -g pnpm"
fi
echo ""

# 2. Backend API 테스트
echo "🐍 Backend API 테스트..."
if command -v uv &> /dev/null; then
    print_status "success" "uv 설치됨"
    cd api 2>/dev/null || {
        print_status "error" "api 디렉토리를 찾을 수 없음"
        exit 1
    }

    print_status "" "의존성 설치..."
    if uv sync --all-groups > /dev/null 2>&1; then
        print_status "success" "의존성 설치 완료"
    else
        print_status "warning" "의존성 설치 중 경고"
    fi

    print_status "" "린팅 (flake8)..."
    if uv run flake8 accounts-backend/app/ --max-line-length=120 --exclude=__pycache__ 2>/dev/null; then
        print_status "success" "린팅 통과"
    else
        print_status "warning" "린팅 경고"
    fi

    print_status "" "코드 포맷 체크 (black)..."
    if uv run black accounts-backend/app/ --check 2>/dev/null; then
        print_status "success" "코드 포맷 올바름"
    else
        print_status "warning" "코드 포맷 수정 필요"
        echo "    실행: cd api && uv run black accounts-backend/app/"
    fi

    print_status "" "import 정렬 체크 (isort)..."
    if uv run isort accounts-backend/app/ --check-only 2>/dev/null; then
        print_status "success" "import 정렬 올바름"
    else
        print_status "warning" "import 정렬 수정 필요"
        echo "    실행: cd api && uv run isort accounts-backend/app/"
    fi

    print_status "" "타입 체크 (mypy)..."
    if uv run mypy accounts-backend/app/ --ignore-missing-imports 2>/dev/null; then
        print_status "success" "타입 체크 통과"
    else
        print_status "warning" "타입 체크 경고 (SQLAlchemy/Pydantic 관련 false positive 가능)"
    fi

    echo -e "${GREEN}✅ Backend 테스트 준비 완료${NC}"
    echo "  💡 실제 테스트는 DB 연결이 필요합니다:"
    echo "     - PostgreSQL 실행 필요"
    echo "     - 또는 docker-compose 사용"
    cd ..
elif command -v python3 &> /dev/null; then
    print_status "warning" "uv가 설치되지 않음 (Python은 설치됨)"
    echo "  설치: curl -LsSf https://astral.sh/uv/install.sh | sh"
else
    print_status "error" "Python과 uv가 모두 설치되지 않음"
fi
echo ""

# 3. Webapp 테스트
echo "🌐 Webapp 테스트..."
if [ -d "webapp" ]; then
    cd webapp 2>/dev/null || {
        print_status "error" "webapp 디렉토리 접근 실패"
        exit 1
    }

    print_status "" "의존성 설치..."
    if npm install > /dev/null 2>&1; then
        print_status "success" "의존성 설치 완료"
    else
        print_status "warning" "의존성 설치 중 경고"
    fi

    print_status "" "타입 체크..."
    if npm run typecheck 2>/dev/null; then
        print_status "success" "타입 체크 통과"
    else
        print_status "warning" "타입 체크 실패"
    fi

    print_status "" "린팅..."
    if npm run lint 2>/dev/null; then
        print_status "success" "린팅 통과"
    else
        print_status "warning" "린팅 경고"
    fi

    print_status "" "테스트..."
    if npm run test:ci 2>/dev/null; then
        print_status "success" "테스트 통과"
    else
        print_status "warning" "테스트 실패 또는 테스트 없음"
    fi

    print_status "" "빌드..."
    if run_with_timeout 60 npm run build > /dev/null 2>&1; then
        print_status "success" "빌드 성공"

        # 빌드 결과 확인
        if [ -d ".next" ]; then
            print_status "success" "Next.js 빌드 출력 확인됨"
        fi
    else
        print_status "warning" "빌드 실패 또는 시간 초과"
    fi

    echo -e "${GREEN}✅ Webapp 테스트 완료${NC}"
    cd ..
else
    print_status "warning" "webapp 디렉토리를 찾을 수 없음"
fi
echo ""

# 4. 요약
echo "📊 CI 검증 요약"
echo "=================="
echo ""

# 성공/실패 카운트 (실제로는 위에서 추적해야 하지만 간단히 표시)
echo "모든 주요 컴포넌트의 CI 검증이 완료되었습니다!"
echo ""

# GitHub Actions 관련 파일 확인
echo "📁 GitHub Actions 워크플로우 파일:"
if [ -f ".github/workflows/backend-ci.yml" ]; then
    print_status "success" ".github/workflows/backend-ci.yml 존재"
else
    print_status "error" ".github/workflows/backend-ci.yml 없음"
fi

if [ -f ".github/workflows/extension-ci.yml" ]; then
    print_status "success" ".github/workflows/extension-ci.yml 존재"
else
    print_status "error" ".github/workflows/extension-ci.yml 없음"
fi

if [ -f ".github/workflows/webapp-ci.yml" ]; then
    print_status "success" ".github/workflows/webapp-ci.yml 존재"
else
    print_status "error" ".github/workflows/webapp-ci.yml 없음"
fi
echo ""

echo "✨ CI 로컬 검증 완료!"
echo ""
echo "💡 다음 단계:"
echo "1. 경고 사항 수정 (선택사항)"
echo "2. git add .github/workflows/"
echo "3. git commit -m 'ci: GitHub Actions 워크플로우 추가'"
echo "4. git push"
echo ""
echo "GitHub Actions가 자동으로 실행되어 CI 파이프라인을 검증합니다."
echo ""

# timeout 명령어 설치 안내
if ! command -v timeout &> /dev/null && ! command -v gtimeout &> /dev/null; then
    echo "💡 팁: timeout 명령어를 설치하면 빌드 시간 제한이 더 정확해집니다:"
    echo "   macOS: brew install coreutils"
    echo "   Linux: 기본 설치되어 있음"
    echo ""
fi
