#!/bin/bash
# Verify CI configuration and dependencies

set -e

echo "===== CI Configuration Verification ====="
echo ""

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo "✅ $1 exists"
        return 0
    else
        echo "❌ $1 is missing"
        return 1
    fi
}

# Function to check command in package.json
check_script() {
    local file=$1
    local script=$2
    if grep -q "\"$script\":" "$file" 2>/dev/null; then
        echo "✅ Script '$script' found in $file"
        return 0
    else
        echo "❌ Script '$script' missing in $file"
        return 1
    fi
}

ERRORS=0

echo "Checking Extension CI requirements:"
check_file "package.json" || ((ERRORS++))
check_file "pnpm-lock.yaml" || ((ERRORS++))
check_file "tsconfig.json" || ((ERRORS++))
check_file "vitest.config.ts" || ((ERRORS++))
check_file "wxt.config.ts" || ((ERRORS++))

check_script "package.json" "build" || ((ERRORS++))
check_script "package.json" "compile" || ((ERRORS++))
check_script "package.json" "lint" || ((ERRORS++))
check_script "package.json" "format:check" || ((ERRORS++))
check_script "package.json" "test:coverage" || ((ERRORS++))

echo ""
echo "Checking Webapp CI requirements:"
if [ -d "webapp" ]; then
    check_file "webapp/package.json" || ((ERRORS++))
    check_file "webapp/tsconfig.json" || ((ERRORS++))
    check_file "webapp/next.config.js" || check_file "webapp/next.config.mjs" || ((ERRORS++))

    check_script "webapp/package.json" "build" || ((ERRORS++))
    check_script "webapp/package.json" "lint" || ((ERRORS++))
    check_script "webapp/package.json" "typecheck" || ((ERRORS++))
    check_script "webapp/package.json" "test:ci" || ((ERRORS++))
    check_script "webapp/package.json" "test:e2e" || ((ERRORS++))
else
    echo "⚠️  Webapp directory not found"
fi

echo ""
echo "Checking Backend CI requirements:"
if [ -d "api" ]; then
    check_file "api/pyproject.toml" || ((ERRORS++))
    check_file "api/uv.lock" || ((ERRORS++))
    check_file "api/accounts-backend/pytest.ini" || ((ERRORS++))
    check_file "api/accounts-backend/scripts/init_test_db.py" || ((ERRORS++))
    check_file "api/run-tests-ci.sh" || ((ERRORS++))
else
    echo "⚠️  API directory not found"
fi

echo ""
echo "Checking GitHub Actions workflows:"
check_file ".github/workflows/extension-ci.yml" || ((ERRORS++))
check_file ".github/workflows/webapp-ci.yml" || ((ERRORS++))
check_file ".github/workflows/backend-ci.yml" || ((ERRORS++))

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ All CI requirements met!"
    exit 0
else
    echo "❌ $ERRORS requirement(s) missing"
    echo ""
    echo "Please ensure all required files and scripts are present before running CI"
    exit 1
fi
