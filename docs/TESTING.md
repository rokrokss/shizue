# Testing Guide for Shizue Project

## Overview

This document describes the testing infrastructure and procedures for the Shizue project, which includes:

- Chrome Extension (TypeScript/React)
- Backend API (Python/FastAPI)
- Webapp (Next.js)

## Quick Start

```bash
# Run all tests
pnpm test:all

# Run CI tests locally
pnpm ci:local

# Install and run pre-commit hooks
pnpm pre-commit:install
pnpm pre-commit
```

## Test Scripts

### 1. Comprehensive Test Suite (`scripts/test-all.sh`)

Runs all tests across all components with detailed reporting:

```bash
./scripts/test-all.sh
```

Features:

- Environment verification
- Pre-commit hook checks
- Extension tests (TypeScript, lint, format, unit, build)
- Backend API tests (format, lint, type check, unit)
- Webapp tests (TypeScript, lint, unit, build)
- Integration tests
- CI configuration verification
- Detailed summary with success rate

### 2. CI Local Test (`test-ci-local.sh`)

Simulates GitHub Actions CI environment locally:

```bash
./test-ci-local.sh
```

Features:

- Tests all components as they would run in CI
- Timeout handling for builds
- Color-coded output
- CI workflow file verification

### 3. Backend CI Test (`api/run-tests-ci.sh`)

Specific to backend API testing:

```bash
cd api && ./run-tests-ci.sh
```

Requirements:

- PostgreSQL running
- Environment variables configured

### 4. Extension/Webapp CI Test (`scripts/run-ci-tests.sh`)

Tests frontend components:

```bash
./scripts/run-ci-tests.sh
```

## Pre-commit Hooks

### Installation

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Or using pnpm
pnpm pre-commit:install
```

### Usage

```bash
# Run on all files
pre-commit run --all-files

# Run specific hook
pre-commit run extension-lint --all-files

# Run manual stage (tests)
pre-commit run --hook-stage manual --all-files

# Skip hooks temporarily
SKIP=webapp-test,api-test git commit -m "message"
```

### Available Hooks

#### Extension Hooks

- `extension-format`: Prettier format check
- `extension-lint`: ESLint
- `extension-typecheck`: TypeScript compilation
- `extension-test`: Vitest (manual stage)

#### Webapp Hooks

- `webapp-format`: Prettier format check
- `webapp-lint`: Next.js ESLint
- `webapp-typecheck`: TypeScript compilation
- `webapp-test`: Jest (manual stage)

#### Backend API Hooks

- `api-format`: isort & black formatting
- `api-lint`: flake8 & mypy
- `api-check`: Format and lint verification
- `api-test`: pytest (manual stage)

## Component-Specific Testing

### Chrome Extension

```bash
# Development
pnpm dev

# Type checking
pnpm exec tsc --noEmit

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
pnpm format:check

# Unit tests
pnpm test
pnpm test:coverage

# Build
pnpm build
```

### Backend API

```bash
cd api

# Using Makefile
make test          # Run tests
make format        # Format code
make lint          # Lint code
make check         # Check format and lint
make ci            # Run CI pipeline

# Using uv directly
uv run pytest -v
uv run black accounts-backend/app/
uv run isort accounts-backend/app/
uv run flake8 accounts-backend/app/
```

### Webapp

```bash
cd webapp

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Unit tests
pnpm test
pnpm test:ci
pnpm test:coverage

# E2E tests
pnpm test:e2e
pnpm test:e2e:ui

# Build
pnpm build
```

## Database Setup for Testing

### Using Docker

```bash
# Start test databases
docker run -d --name test-postgres \
  -p 5432:5432 \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test_db \
  postgres:15

# Stop and remove
docker stop test-postgres
docker rm test-postgres
```

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# Run tests
cd api && make test

# Stop services
docker-compose down
```

## CI/CD Integration

### GitHub Actions Workflows

- `.github/workflows/backend-ci.yml`: Backend API tests
- `.github/workflows/extension-ci.yml`: Chrome Extension tests
- `.github/workflows/webapp-ci.yml`: Webapp tests

### Verifying CI Configuration

```bash
# Check CI files
./.github/scripts/verify-ci.sh

# Test CI locally
./test-ci-local.sh
```

## Environment Variables

### Backend Testing

```bash
export DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test_db"
export JWT_SECRET_KEY="test_secret_key"
export GOOGLE_CLIENT_ID="test_client_id"
export GOOGLE_CLIENT_SECRET="test_client_secret"
export TESTING="true"
```

### Webapp Testing

```bash
export NEXT_PUBLIC_API_URL="http://localhost:8000"
export NODE_ENV="test"
```

## Troubleshooting

### Common Issues

1. **TypeScript errors in webapp**

   ```bash
   cd webapp && pnpm exec tsc --noEmit
   ```

2. **Python formatting issues**

   ```bash
   cd api && make format
   ```

3. **Pre-commit hook failures**

   ```bash
   # Update hooks
   pre-commit autoupdate

   # Clean cache
   pre-commit clean
   ```

4. **Database connection errors**
   - Ensure PostgreSQL are running
   - Check environment variables
   - Verify port availability

5. **Timeout issues**
   ```bash
   # Install timeout command (macOS)
   brew install coreutils
   ```

## Best Practices

1. **Run tests before committing**
   - Pre-commit hooks handle this automatically
   - Or run `pnpm test:all` manually

2. **Keep tests fast**
   - Use `stages: [manual]` for slow tests in pre-commit
   - Mock external dependencies
   - Use test databases

3. **Maintain test coverage**
   - Extension: `pnpm test:coverage`
   - Backend: `cd api && make test`
   - Webapp: `cd webapp && pnpm test:coverage`

4. **Fix issues immediately**
   - Format: `pnpm format && cd api && make format`
   - Lint: `pnpm lint:fix`
   - Types: Fix TypeScript errors before committing

## Continuous Improvement

1. **Add new tests** when adding features
2. **Update test scripts** when changing structure
3. **Monitor CI results** in GitHub Actions
4. **Review test coverage** reports regularly
5. **Optimize slow tests** to improve developer experience
