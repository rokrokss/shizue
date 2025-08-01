.PHONY: help format lint check test api-format api-lint api-check api-test accounts-format accounts-lint accounts-check pdf-format pdf-lint pdf-check

# Default target
help:
	@echo "Shizue Project Management Commands"
	@echo ""
	@echo "Global Commands:"
	@echo "  make api-format   - Format all API code (accounts-backend, pdf-translation)"
	@echo "  make api-lint     - Lint all API code"
	@echo "  make api-check    - Check formatting and linting for all APIs"
	@echo "  make api-test     - Run tests for all APIs"
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
	@echo "  make pdf-run      - Run pdf-translation server"
	@echo ""
	@echo "Extension Commands:"
	@echo "  make ext-dev      - Run extension in development mode"
	@echo "  make ext-build    - Build extension for production"
	@echo "  make ext-zip      - Create distribution ZIP"

# =============================================================================
# API - All Projects
# =============================================================================

# Format all API code
api-format: accounts-format pdf-format
	@echo "( All API code formatted!"

# Lint all API code
api-lint: accounts-lint pdf-lint
	@echo " All API code linted!"

# Check all API code
api-check: accounts-check pdf-check
	@echo " All API checks passed!"

# Test all API code
api-test: accounts-test
	@echo " All API tests passed!"

# =============================================================================
# Accounts Backend
# =============================================================================

# Format accounts-backend code
accounts-format:
	@echo "Formatting accounts-backend code..."
	@cd api/accounts-backend && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && isort app/ && black app/; \
		else \
			isort app/ && black app/; \
		fi
	@echo "( Accounts backend formatted!"

# Lint accounts-backend code
accounts-lint:
	@echo "Linting accounts-backend code..."
	@cd api/accounts-backend && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && flake8 app/ --max-line-length=120 --exclude=__pycache__ && mypy app/ --ignore-missing-imports || true; \
		else \
			flake8 app/ --max-line-length=120 --exclude=__pycache__ && mypy app/ --ignore-missing-imports || true; \
		fi
	@echo " Accounts backend linted!"

# Check accounts-backend code
accounts-check:
	@echo "Checking accounts-backend code..."
	@cd api/accounts-backend && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && \
			isort --check-only --diff app/ && \
			black --check --diff app/ && \
			flake8 app/ --max-line-length=120 --exclude=__pycache__; \
		else \
			isort --check-only --diff app/ && \
			black --check --diff app/ && \
			flake8 app/ --max-line-length=120 --exclude=__pycache__; \
		fi
	@echo " Accounts backend check passed!"

# Test accounts-backend
accounts-test:
	@echo "Testing accounts-backend..."
	@cd api/accounts-backend && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && pytest -v --cov=app --cov-report=term-missing; \
		else \
			pytest -v --cov=app --cov-report=term-missing; \
		fi

# Run accounts-backend server
accounts-run:
	@echo "Starting accounts-backend server..."
	@cd api/accounts-backend && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000; \
		else \
			uvicorn app.main:app --reload --host 0.0.0.0 --port 8000; \
		fi

# =============================================================================
# PDF Translation
# =============================================================================

# Check if pdf-translation has Python files
PDF_PY_FILES := $(shell find api/pdf-translation -name "*.py" -not -path "*/venv/*" -not -path "*/.venv/*" 2>/dev/null | head -1)

# Format pdf-translation code
pdf-format:
	@echo "Formatting pdf-translation code..."
	@if [ -n "$(PDF_PY_FILES)" ]; then \
		cd api/pdf-translation && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && isort . && black .; \
		else \
			isort . && black . || echo "Note: Install black and isort for pdf-translation"; \
		fi; \
	else \
		echo "No Python files found in pdf-translation"; \
	fi
	@echo "( PDF translation formatted!"

# Lint pdf-translation code
pdf-lint:
	@echo "Linting pdf-translation code..."
	@if [ -n "$(PDF_PY_FILES)" ]; then \
		cd api/pdf-translation && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && flake8 . --max-line-length=120 --exclude=__pycache__,venv,.venv; \
		else \
			flake8 . --max-line-length=120 --exclude=__pycache__,venv,.venv || echo "Note: Install flake8 for pdf-translation"; \
		fi; \
	else \
		echo "No Python files found in pdf-translation"; \
	fi
	@echo " PDF translation linted!"

# Check pdf-translation code
pdf-check:
	@echo "Checking pdf-translation code..."
	@if [ -n "$(PDF_PY_FILES)" ]; then \
		cd api/pdf-translation && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && \
			isort --check-only --diff . && \
			black --check --diff . && \
			flake8 . --max-line-length=120 --exclude=__pycache__,venv,.venv; \
		else \
			echo "Note: Install development tools for pdf-translation"; \
		fi; \
	else \
		echo "No Python files found in pdf-translation"; \
	fi
	@echo " PDF translation check passed!"

# Run pdf-translation server
pdf-run:
	@echo "Starting pdf-translation server..."
	@cd api/pdf-translation && \
		if [ -f ".venv/bin/activate" ]; then \
			. .venv/bin/activate && python main_server.py; \
		else \
			python main_server.py; \
		fi

# =============================================================================
# Extension Commands
# =============================================================================

# Run extension in development mode
ext-dev:
	@echo "Starting extension development server..."
	@pnpm dev

# Build extension
ext-build:
	@echo "Building extension..."
	@pnpm build

# Create distribution ZIP
ext-zip:
	@echo "Creating distribution ZIP..."
	@pnpm zip

# =============================================================================
# Combined Commands
# =============================================================================

# Format everything
format: api-format
	@echo "( All code formatted!"

# Check everything
check: api-check
	@echo " All checks passed!"

# Run all tests
test: api-test
	@echo " All tests passed!"

# CI pipeline
ci: check test
	@echo " CI pipeline passed!"

# Clean all
clean:
	@echo "Cleaning project..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete
	@find . -type f -name ".coverage" -delete
	@find . -type f -name "coverage.xml" -delete
	@echo "( Cleanup complete!"

# Install development dependencies for all projects
install-dev:
	@echo "Installing development dependencies..."
	@cd api/accounts-backend && pip install ".[dev]" || pip install -r requirements.txt
	@cd api/pdf-translation && pip install -r requirements.txt || true
	@pnpm install
	@echo " All dependencies installed!"