#!/bin/bash
# Run CI tests locally to verify CI configuration

set -e  # Exit on error

echo "===== CI Test Runner ====="
echo "This script tests all CI workflows locally"
echo ""

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "Error: pnpm is not installed. Please install it first:"
    echo "  npm install -g pnpm"
    exit 1
fi

# Check if uv is installed for backend tests
if ! command -v uv &> /dev/null; then
    echo "Warning: uv is not installed. Backend tests will be skipped."
    echo "To install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
    SKIP_BACKEND=true
fi

# Function to run tests with nice output
run_test() {
    local name=$1
    local cmd=$2
    echo ""
    echo "🔧 Running: $name"
    echo "  Command: $cmd"
    if eval "$cmd"; then
        echo "✅ $name: PASSED"
        return 0
    else
        echo "❌ $name: FAILED"
        return 1
    fi
}

# Track failures
FAILURES=0

# Test Extension CI
echo ""
echo "===== Extension CI Tests ====="
cd "$(dirname "$0")/.."  # Go to project root

# Install dependencies
run_test "Extension: Install dependencies" "pnpm install --frozen-lockfile" || ((FAILURES++))

# Type checking
run_test "Extension: TypeScript check" "pnpm exec tsc --noEmit" || ((FAILURES++))

# Code formatting
run_test "Extension: Format check" "pnpm format:check" || ((FAILURES++))

# Linting
run_test "Extension: Lint" "pnpm lint" || ((FAILURES++))

# Unit tests
run_test "Extension: Tests" "pnpm test:coverage" || ((FAILURES++))

# Build
run_test "Extension: Build" "pnpm build" || ((FAILURES++))

# Test Webapp CI
echo ""
echo "===== Webapp CI Tests ====="
if [ -d "webapp" ]; then
    cd webapp

    # Install dependencies
    run_test "Webapp: Install dependencies" "pnpm install --frozen-lockfile" || ((FAILURES++))

    # Type checking
    run_test "Webapp: TypeScript check" "pnpm typecheck" || ((FAILURES++))

    # Linting
    run_test "Webapp: Lint" "pnpm lint" || ((FAILURES++))

    # Unit tests
    run_test "Webapp: Tests" "pnpm test:ci" || ((FAILURES++))

    # Build
    run_test "Webapp: Build" "NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm build" || ((FAILURES++))

    cd ..
else
    echo "Webapp directory not found, skipping webapp tests"
fi

# Test Backend CI
echo ""
echo "===== Backend CI Tests ====="
if [ "$SKIP_BACKEND" != "true" ] && [ -d "api" ]; then
    cd api

    # Install dependencies
    run_test "Backend: Install dependencies" "uv sync --all-groups" || ((FAILURES++))

    # Linting
    run_test "Backend: Black check" "uv run black --check --diff accounts-backend/app/" || ((FAILURES++))
    run_test "Backend: isort check" "uv run isort --check-only --diff accounts-backend/app/" || ((FAILURES++))
    run_test "Backend: flake8" "uv run flake8 accounts-backend/app/ --max-line-length=120 --exclude=__pycache__" || ((FAILURES++))

    # Tests (requires database)
    if command -v docker &> /dev/null; then
        echo ""
        echo "Starting test databases with Docker..."
        docker run -d --name test-postgres -p 5432:5432 \
            -e POSTGRES_USER=test \
            -e POSTGRES_PASSWORD=test \
            -e POSTGRES_DB=test_db \
            postgres:15 || echo "PostgreSQL container may already exist"

        # Wait for databases
        sleep 5

        # Run tests
        export DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test_db"
        export JWT_SECRET_KEY="test_secret_key_for_ci"
        export GOOGLE_CLIENT_ID="test_client_id"
        export GOOGLE_CLIENT_SECRET="test_client_secret"
        export GOOGLE_REDIRECT_URI="http://localhost:8000/v1/auth/callback/google"
        export TESTING="true"

        cd accounts-backend
        run_test "Backend: Tests" "uv run pytest -v --cov=app --cov-report=term-missing" || ((FAILURES++))
        cd ../..

        # Cleanup
        echo "Stopping test databases..."
        docker stop test-postgres || true
        docker rm test-postgres || true
    else
        echo "Docker not found, skipping backend tests that require database"
    fi
else
    echo "Backend tests skipped"
fi

# Summary
echo ""
echo "===== Test Summary ====="
if [ $FAILURES -eq 0 ]; then
    echo "✅ All tests passed!"
    exit 0
else
    echo "❌ $FAILURES test(s) failed"
    echo ""
    echo "To fix issues:"
    echo "  - For formatting: pnpm format"
    echo "  - For linting: pnpm lint:fix"
    echo "  - For backend formatting: cd api && uv run black accounts-backend/app/ && uv run isort accounts-backend/app/"
    exit 1
fi
