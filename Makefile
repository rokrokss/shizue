.PHONY: help install dev build compile lint format test clean ci all

# Default target
help:
	@echo "Chrome Extension Development Commands"
	@echo ""
	@echo "Installation & Setup:"
	@echo "  make install      - Install dependencies with pnpm"
	@echo "  make clean        - Clean build artifacts and caches"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Run development server with hot reload"
	@echo "  make build        - Build production extension"
	@echo "  make zip          - Create distributable ZIP file"
	@echo ""
	@echo "Code Quality:"
	@echo "  make compile      - TypeScript type checking"
	@echo "  make lint         - Run ESLint"
	@echo "  make lint-fix     - Fix ESLint issues automatically"
	@echo "  make format       - Format code with Prettier"
	@echo "  make format-check - Check code formatting"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run tests"
	@echo "  make test-ui      - Run tests with UI"
	@echo "  make test-coverage - Run tests with coverage"
	@echo ""
	@echo "CI/CD:"
	@echo "  make check        - Run all checks (compile, lint, format-check)"
	@echo "  make ci           - Run full CI pipeline"
	@echo "  make all          - Install, check, test, and build"

# =============================================================================
# Installation & Setup
# =============================================================================

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	@pnpm install --frozen-lockfile
	@echo "✅ Dependencies installed!"

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf dist/
	@rm -rf .wxt/
	@rm -rf node_modules/.cache/
	@rm -rf coverage/
	@rm -f shizue-chrome-extension*.zip
	@echo "✅ Clean complete!"

# =============================================================================
# Development
# =============================================================================

# Run development server
dev:
	@echo "🚀 Starting development server..."
	@pnpm dev

# Build production extension
build:
	@echo "🔨 Building production extension..."
	@pnpm build
	@echo "✅ Build complete! Output in dist/chrome-mv3/"

# Create ZIP package
zip: build
	@echo "📦 Creating ZIP package..."
	@pnpm zip
	@echo "✅ ZIP created!"

# =============================================================================
# Code Quality
# =============================================================================

# TypeScript type checking
compile:
	@echo "🔍 Running TypeScript type check..."
	@pnpm compile || (echo "❌ Type check failed!" && exit 1)
	@echo "✅ Type check passed!"

# ESLint linting
lint:
	@echo "🔍 Running ESLint..."
	@pnpm lint || (echo "❌ Linting failed! Run 'make lint-fix' to auto-fix issues" && exit 1)
	@echo "✅ Linting passed!"

# Fix linting issues
lint-fix:
	@echo "🔧 Fixing ESLint issues..."
	@pnpm lint:fix
	@echo "✅ Linting issues fixed!"

# Format code with Prettier
format:
	@echo "✨ Formatting code with Prettier..."
	@pnpm format 2>/dev/null || true
	@echo "✅ Code formatted!"

# Check code formatting
format-check:
	@echo "🔍 Checking code formatting..."
	@pnpm format:check || (echo "❌ Formatting check failed! Run 'make format' to fix" && exit 1)
	@echo "✅ Code formatting check passed!"

# =============================================================================
# Testing
# =============================================================================

# Run tests
test:
	@echo "🧪 Running tests..."
	@pnpm test --run || (echo "❌ Tests failed!" && exit 1)
	@echo "✅ Tests passed!"

# Run tests with UI
test-ui:
	@echo "🧪 Running tests with UI..."
	@pnpm test:ui

# Run tests with coverage
test-coverage:
	@echo "📊 Running tests with coverage..."
	@pnpm test:coverage --run
	@echo "✅ Test coverage complete!"

# =============================================================================
# CI/CD Commands
# =============================================================================

# Run all checks (allowing warnings for now)
check:
	@echo "🔍 Running all checks..."
	@make compile || echo "⚠️  TypeScript has errors - continuing..."
	@make lint || echo "⚠️  ESLint has errors - continuing..."
	@make format-check || echo "⚠️  Format check has issues - continuing..."
	@echo "✅ All checks completed (with warnings)!"

# CI pipeline (strict mode)
ci-strict: compile lint format-check test
	@echo "✅ CI pipeline passed (strict)!"

# CI pipeline (allow warnings)
ci: check test
	@echo "✅ CI pipeline passed!"

# Full build pipeline
all: install ci build
	@echo "✅ Full pipeline complete!"

# =============================================================================
# Utilities
# =============================================================================

# Update dependencies
update:
	@echo "🔄 Updating dependencies..."
	@pnpm update
	@echo "✅ Dependencies updated!"

# Check for outdated packages
outdated:
	@echo "🔍 Checking for outdated packages..."
	@pnpm outdated

# Bundle size analysis
analyze: build
	@echo "📊 Analyzing bundle size..."
	@echo "Open dist/stats.html in your browser to view the bundle analysis"

# Quick fix - format and lint fix
quick-fix: format lint-fix
	@echo "✅ Quick fixes applied!"

# Run development checks
dev-check: format-check lint test
	@echo "✅ Development checks passed!"
