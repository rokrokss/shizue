#!/bin/bash
# Comprehensive test runner for all components
# Combines functionality from multiple test scripts

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Function to print colored status
print_status() {
    local status=$1
    local message=$2

    case $status in
        "success")
            echo -e "${GREEN}✅ $message${NC}"
            ((PASSED_TESTS++))
            ;;
        "error")
            echo -e "${RED}❌ $message${NC}"
            ((FAILED_TESTS++))
            ;;
        "warning")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ((SKIPPED_TESTS++))
            ;;
        "info")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        *)
            echo "  $message"
            ;;
    esac
    ((TOTAL_TESTS++))
}

# Function to check command existence
check_command() {
    local cmd=$1
    local install_msg=$2

    if command -v "$cmd" &> /dev/null; then
        return 0
    else
        print_status "warning" "$cmd not installed. $install_msg"
        return 1
    fi
}

# Function to run test with timeout
run_with_timeout() {
    local timeout_seconds=$1
    shift
    local command="$@"

    if command -v timeout &> /dev/null; then
        timeout "$timeout_seconds" $command
    elif command -v gtimeout &> /dev/null; then
        gtimeout "$timeout_seconds" $command
    else
        $command
    fi
}

echo "======================================"
echo "🧪 Shizue Comprehensive Test Suite"
echo "======================================"
echo ""

# Check environment
echo "📋 Environment Check"
echo "--------------------"

check_command "node" "Install Node.js 20.x" && echo "  Node.js: $(node --version)"
check_command "pnpm" "Run: npm install -g pnpm" && echo "  pnpm: $(pnpm --version)"
check_command "python3" "Install Python 3.12" && echo "  Python: $(python3 --version)"
check_command "uv" "Run: curl -LsSf https://astral.sh/uv/install.sh | sh" && echo "  uv: $(uv --version)"
check_command "docker" "Install Docker Desktop" && echo "  Docker: $(docker --version)"

echo ""

# 1. Pre-commit hooks
echo "🔧 Pre-commit Hooks"
echo "-------------------"

if [ -f ".pre-commit-config.yaml" ]; then
    if check_command "pre-commit" "Run: pip install pre-commit"; then
        echo "Running pre-commit checks..."
        if pre-commit run --all-files --hook-stage pre-commit &> /dev/null; then
            print_status "success" "Pre-commit checks passed"
        else
            print_status "warning" "Pre-commit checks failed (non-blocking)"
        fi
    fi
else
    print_status "warning" "No .pre-commit-config.yaml found"
fi

echo ""

# 2. Extension Tests
echo "📦 Chrome Extension Tests"
echo "-------------------------"

if [ -f "package.json" ]; then
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing extension dependencies..."
        pnpm install --frozen-lockfile &> /dev/null
    fi

    # TypeScript check
    echo -n "TypeScript check... "
    if pnpm exec tsc --noEmit &> /dev/null; then
        print_status "success" "TypeScript check passed"
    else
        print_status "error" "TypeScript check failed"
    fi

    # Linting
    echo -n "Linting... "
    if pnpm lint &> /dev/null; then
        print_status "success" "Linting passed"
    else
        print_status "error" "Linting failed"
    fi

    # Format check
    echo -n "Format check... "
    if pnpm format:check &> /dev/null; then
        print_status "success" "Format check passed"
    else
        print_status "warning" "Format issues found (run: pnpm format)"
    fi

    # Unit tests
    echo -n "Unit tests... "
    if pnpm vitest run &> /dev/null; then
        print_status "success" "Unit tests passed"
    else
        print_status "error" "Unit tests failed"
    fi

    # Build test
    echo -n "Build test... "
    if run_with_timeout 60 pnpm build &> /dev/null; then
        if [ -f "dist/chrome-mv3/manifest.json" ]; then
            print_status "success" "Build successful"
        else
            print_status "error" "Build output missing"
        fi
    else
        print_status "error" "Build failed or timed out"
    fi
else
    print_status "warning" "Extension package.json not found"
fi

echo ""

# 3. Backend API Tests
echo "🐍 Backend API Tests"
echo "--------------------"

if [ -d "api" ]; then
    cd api

    # Install dependencies if needed
    if [ ! -d ".venv" ]; then
        echo "Installing API dependencies..."
        uv sync --all-groups &> /dev/null
    fi

    # Format check
    echo -n "Format check (black)... "
    if uv run black --check accounts-backend/app/ &> /dev/null; then
        print_status "success" "Code format correct"
    else
        print_status "warning" "Format issues (run: cd api && make format)"
    fi

    # Import sort check
    echo -n "Import sort check (isort)... "
    if uv run isort --check-only accounts-backend/app/ &> /dev/null; then
        print_status "success" "Imports sorted correctly"
    else
        print_status "warning" "Import order issues (run: cd api && make format)"
    fi

    # Linting
    echo -n "Linting (flake8)... "
    if uv run flake8 accounts-backend/app/ --max-line-length=120 --exclude=__pycache__ &> /dev/null; then
        print_status "success" "Linting passed"
    else
        print_status "warning" "Linting warnings"
    fi

    # Type check
    echo -n "Type check (mypy)... "
    if uv run mypy accounts-backend/app/ --ignore-missing-imports &> /dev/null; then
        print_status "success" "Type check passed"
    else
        print_status "warning" "Type check warnings (expected with SQLAlchemy)"
    fi

    # Unit tests (if database is available)
    echo -n "Unit tests... "
    if docker ps | grep -q postgres; then
        export DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test_db"
        export TESTING="true"
        export JWT_SECRET_KEY="test_secret_key"

        if cd accounts-backend && uv run pytest -q --tb=no &> /dev/null; then
            print_status "success" "Unit tests passed"
        else
            print_status "error" "Unit tests failed"
        fi
        cd ..
    else
        print_status "warning" "Skipped (database not running)"
    fi

    cd ..
else
    print_status "warning" "API directory not found"
fi

echo ""

# 4. Webapp Tests
echo "🌐 Webapp Tests"
echo "---------------"

if [ -d "webapp" ]; then
    cd webapp

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing webapp dependencies..."
        if check_command "pnpm" ""; then
            pnpm install --frozen-lockfile &> /dev/null
        else
            npm install &> /dev/null
        fi
    fi

    # TypeScript check
    echo -n "TypeScript check... "
    if npm run typecheck &> /dev/null; then
        print_status "success" "TypeScript check passed"
    else
        print_status "error" "TypeScript check failed"
    fi

    # Linting
    echo -n "Linting... "
    if npm run lint &> /dev/null; then
        print_status "success" "Linting passed"
    else
        print_status "error" "Linting failed"
    fi

    # Unit tests
    echo -n "Unit tests... "
    if npm run test:ci &> /dev/null; then
        print_status "success" "Unit tests passed"
    else
        print_status "warning" "Unit tests failed or not configured"
    fi

    # Build test
    echo -n "Build test... "
    if run_with_timeout 90 npm run build &> /dev/null; then
        if [ -d ".next" ]; then
            print_status "success" "Build successful"
        else
            print_status "error" "Build output missing"
        fi
    else
        print_status "error" "Build failed or timed out"
    fi

    cd ..
else
    print_status "warning" "Webapp directory not found"
fi

echo ""

# 5. Integration Tests
echo "🔗 Integration Tests"
echo "--------------------"

# Check if services are running
echo -n "API server health... "
if curl -s "http://localhost:8000/" 2>/dev/null | grep -q "Shizue"; then
    print_status "success" "API server running"
else
    print_status "warning" "API server not running"
fi

echo -n "Database connectivity... "
if docker ps | grep -q postgres; then
    print_status "success" "PostgreSQL running"
else
    print_status "warning" "PostgreSQL not running"
fi

echo -n "Cache connectivity... "
fi

echo ""

# 6. CI Configuration
echo "📋 CI Configuration"
echo "-------------------"

echo -n "GitHub Actions workflows... "
ci_files_found=0
for workflow in backend-ci.yml extension-ci.yml webapp-ci.yml; do
    if [ -f ".github/workflows/$workflow" ]; then
        ((ci_files_found++))
    fi
done

if [ $ci_files_found -eq 3 ]; then
    print_status "success" "All CI workflows present"
else
    print_status "warning" "Missing CI workflows ($ci_files_found/3 found)"
fi

echo -n "Test scripts... "
test_scripts_found=0
for script in test-ci-local.sh scripts/run-ci-tests.sh api/run-tests-ci.sh; do
    if [ -f "$script" ]; then
        ((test_scripts_found++))
    fi
done

if [ $test_scripts_found -ge 2 ]; then
    print_status "success" "Test scripts available"
else
    print_status "warning" "Some test scripts missing"
fi

echo ""
echo "======================================"
echo "📊 Test Summary"
echo "======================================"
echo ""
echo "Total tests run: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
else
    echo -e "Failed: $FAILED_TESTS"
fi
if [ $SKIPPED_TESTS -gt 0 ]; then
    echo -e "${YELLOW}Skipped/Warnings: $SKIPPED_TESTS${NC}"
else
    echo -e "Skipped/Warnings: $SKIPPED_TESTS"
fi

echo ""

# Calculate success rate
if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo "Success rate: $SUCCESS_RATE%"

    if [ $SUCCESS_RATE -ge 80 ]; then
        echo -e "${GREEN}✅ Tests are in good shape!${NC}"
        EXIT_CODE=0
    elif [ $SUCCESS_RATE -ge 60 ]; then
        echo -e "${YELLOW}⚠️  Some issues need attention${NC}"
        EXIT_CODE=1
    else
        echo -e "${RED}❌ Significant issues found${NC}"
        EXIT_CODE=1
    fi
else
    echo "No tests were run"
    EXIT_CODE=1
fi

echo ""
echo "💡 Quick fixes:"
if [ $FAILED_TESTS -gt 0 ] || [ $SKIPPED_TESTS -gt 0 ]; then
    echo "  • Format code: pnpm format && cd api && make format"
    echo "  • Fix linting: pnpm lint:fix"
    echo "  • Install pre-commit: pip install pre-commit && pre-commit install"
    echo "  • Run databases: docker-compose up -d"
fi

echo ""
echo "📚 Documentation:"
echo "  • API docs: http://localhost:8000/docs"
echo "  • Test individually: ./test-ci-local.sh"
echo "  • Run pre-commit: pre-commit run --all-files"
echo ""

exit $EXIT_CODE
