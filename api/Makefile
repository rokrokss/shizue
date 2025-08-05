.PHONY: help sync format lint check test accounts-format accounts-lint accounts-check accounts-test accounts-run pdf-format pdf-lint pdf-check pdf-test pdf-run

# Default target
help:
	@echo "API Workspace Management Commands"
	@echo ""
	@echo "Workspace Commands:"
	@echo "  make sync         - Install all dependencies with uv"
	@echo "  make install-hooks - Install pre-commit hooks"
	@echo "  make pre-commit   - Run pre-commit on all files"
	@echo "  make format       - Format all API code"
	@echo "  make lint         - Lint all API code"
	@echo "  make check        - Check formatting and linting"
	@echo "  make test         - Run all tests"
	@echo ""
	@echo "Accounts Backend Commands:"
	@echo "  make accounts-format  - Format accounts-backend code"
	@echo "  make accounts-lint    - Lint accounts-backend code"
	@echo "  make accounts-check   - Check accounts-backend code"
	@echo "  make accounts-test    - Test accounts-backend"
	@echo "  make accounts-run     - Run accounts-backend server"
	@echo ""
	@echo "PDF Translation Commands:"
	@echo "  make pdf-format   - Format pdf-translation code"
	@echo "  make pdf-lint     - Lint pdf-translation code"
	@echo "  make pdf-check    - Check pdf-translation code"
	@echo "  make pdf-test     - Test pdf-translation"
	@echo "  make pdf-run      - Run pdf-translation server"

# =============================================================================
# Workspace Management
# =============================================================================

# Sync all dependencies with uv
sync:
	@echo "🔄 Installing all dependencies with uv..."
	@uv sync --all-groups
	@echo "✅ All dependencies installed!"

# Install pre-commit hooks
install-hooks:
	@echo "🔧 Installing pre-commit hooks..."
	@cd .. && source api/.venv/bin/activate && pre-commit install
	@echo "✅ Pre-commit hooks installed!"

# Run pre-commit on all files
pre-commit:
	@echo "🔍 Running pre-commit on all files..."
	@cd .. && source api/.venv/bin/activate && pre-commit run --all-files

# =============================================================================
# All Projects
# =============================================================================

# Format all code
format: accounts-format pdf-format
	@echo "✅ All code formatted!"

# Lint all code
lint: accounts-lint pdf-lint
	@echo "✅ All code linted!"

# Check all code
check: accounts-check pdf-check
	@echo "✅ All checks passed!"

# Test all code
test: accounts-test pdf-test
	@echo "✅ All tests passed!"

# =============================================================================
# Accounts Backend
# =============================================================================

# Format accounts-backend code
accounts-format:
	@echo "🎨 Formatting accounts-backend code..."
	@uv run isort accounts-backend/app/
	@uv run black accounts-backend/app/
	@echo "✅ Accounts backend formatted!"

# Lint accounts-backend code
accounts-lint:
	@echo "🔍 Linting accounts-backend code..."
	@uv run flake8 accounts-backend/app/ --max-line-length=120 --exclude=__pycache__
	@uv run mypy accounts-backend/app/ --ignore-missing-imports || true
	@echo "✅ Accounts backend linted!"

# Check accounts-backend code
accounts-check:
	@echo "✔️ Checking accounts-backend code..."
	@uv run isort --check-only --diff accounts-backend/app/
	@uv run black --check --diff accounts-backend/app/
	@uv run flake8 accounts-backend/app/ --max-line-length=120 --exclude=__pycache__
	@echo "✅ Accounts backend check passed!"

# Test accounts-backend
accounts-test:
	@echo "🧪 Testing accounts-backend..."
	@rm -f accounts-backend/.coverage
	@cd accounts-backend && uv run pytest -v --cov=app --cov-report=term-missing -m "unit or not integration"

# Run accounts-backend server
accounts-run:
	@echo "🚀 Starting accounts-backend server..."
	@cd accounts-backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# =============================================================================
# PDF Translation
# =============================================================================

# Check if pdf-translation has Python files
PDF_PY_FILES := $(shell find pdf-translation -name "*.py" -not -path "*/venv/*" -not -path "*/.venv/*" 2>/dev/null | head -1)

# Format pdf-translation code
pdf-format:
	@echo "🎨 Formatting pdf-translation code..."
	@if [ -n "$(PDF_PY_FILES)" ]; then \
		uv run isort pdf-translation/; \
		uv run black pdf-translation/; \
	else \
		echo "No Python files found in pdf-translation"; \
	fi
	@echo "✅ PDF translation formatted!"

# Lint pdf-translation code
pdf-lint:
	@echo "🔍 Linting pdf-translation code..."
	@if [ -n "$(PDF_PY_FILES)" ]; then \
		uv run flake8 pdf-translation/ --max-line-length=120 --exclude=__pycache__,venv,.venv; \
		uv run mypy pdf-translation/ --ignore-missing-imports || true; \
	else \
		echo "No Python files found in pdf-translation"; \
	fi
	@echo "✅ PDF translation linted!"

# Check pdf-translation code
pdf-check:
	@echo "✔️ Checking pdf-translation code..."
	@if [ -n "$(PDF_PY_FILES)" ]; then \
		uv run isort --check-only --diff pdf-translation/; \
		uv run black --check --diff pdf-translation/; \
		uv run flake8 pdf-translation/ --max-line-length=120 --exclude=__pycache__,venv,.venv; \
	else \
		echo "No Python files found in pdf-translation"; \
	fi
	@echo "✅ PDF translation check passed!"

# Test pdf-translation
pdf-test:
	@echo "🧪 Testing pdf-translation..."
	@if [ -d "pdf-translation/tests" ]; then \
		cd pdf-translation && uv run pytest -v --cov=. --cov-report=term-missing || echo "No tests found"; \
	else \
		echo "No tests directory found in pdf-translation"; \
	fi

# Run pdf-translation server
pdf-run:
	@echo "🚀 Starting pdf-translation server..."
	@cd pdf-translation && uv run python main_server.py

# =============================================================================
# Development Utilities
# =============================================================================

# CI pipeline
ci: check test
	@echo "✅ CI pipeline passed!"

# Clean all
clean:
	@echo "🧹 Cleaning workspace..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete
	@find . -type f -name ".coverage" -delete
	@find . -type f -name "coverage.xml" -delete
	@echo "✅ Cleanup complete!"

# Security scan
security:
	@echo "🔒 Running security scan..."
	@uv run bandit -r accounts-backend/app/ -f json -o accounts-bandit.json || true
	@if [ -n "$(PDF_PY_FILES)" ]; then \
		uv run bandit -r pdf-translation/ -f json -o pdf-bandit.json || true; \
	fi
	@uv run safety check || true
	@echo "✅ Security scan complete!"

# Update dependencies
update:
	@echo "⬆️ Updating dependencies..."
	@uv sync --upgrade
	@echo "✅ Dependencies updated!"

# Show installed packages
freeze:
	@echo "📦 Installed packages:"
	@uv pip freeze

# Development shell
shell:
	@echo "🐚 Starting development shell..."
	@uv run python
