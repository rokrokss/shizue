.PHONY: help build up down logs shell test clean migrate install dev-install format lint check run

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "Docker commands:"
	@echo "  make build      - Build Docker images"
	@echo "  make up         - Start all services"
	@echo "  make up-dev     - Start all services with development tools"
	@echo "  make down       - Stop all services"
	@echo "  make logs       - View logs"
	@echo "  make shell      - Access API container shell"
	@echo "  make db-shell   - Access PostgreSQL shell"
	@echo "  make test       - Run tests"
	@echo "  make migrate    - Run database migrations"
	@echo "  make clean      - Clean up containers and volumes"
	@echo ""
	@echo "Local development commands:"
	@echo "  make install      - Install production dependencies"
	@echo "  make dev-install  - Install all dependencies including dev tools"
	@echo "  make format       - Format code with isort and black"
	@echo "  make lint         - Run linting checks (flake8)"
	@echo "  make check        - Check code formatting and linting"
	@echo "  make run          - Run the development server locally"
	@echo "  make local-test   - Run tests locally"

# Build Docker images
build:
	docker-compose build

# Start services
up:
	docker-compose up -d

# Start services with development configuration
up-dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Start services with development tools
up-dev-tools:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml --profile dev-tools up -d

# Stop services
down:
	docker-compose down

# Stop services and remove volumes
down-v:
	docker-compose down -v

# View logs
logs:
	docker-compose logs -f

# View specific service logs
logs-api:
	docker-compose logs -f api

logs-postgres:
	docker-compose logs -f postgres

logs-redis:
	docker-compose logs -f redis

# Access containers
shell:
	docker-compose exec api /bin/bash

db-shell:
	docker-compose exec postgres psql -U shizue -d shizue_accounts

redis-cli:
	docker-compose exec redis redis-cli -a redis_password

# Run tests
test:
	docker-compose exec api pytest

# Database operations
migrate:
	docker-compose exec api alembic upgrade head

migrate-create:
	@read -p "Enter migration message: " msg; \
	docker-compose exec api alembic revision --autogenerate -m "$$msg"

migrate-down:
	docker-compose exec api alembic downgrade -1

# Clean up
clean:
	docker-compose down -v
	docker system prune -f

# Development shortcuts
dev: up-dev logs-api

# Production build
prod-build:
	docker build -t shizue-accounts-api:latest -f Dockerfile .

# =============================================================================
# Local Development Commands (requires activated venv)
# =============================================================================

# Install production dependencies
install:
	@echo "Installing production dependencies..."
	@pip install -r requirements.txt

# Install all dependencies including dev tools
dev-install:
	@echo "Installing development dependencies..."
	@pip install -r requirements-dev.txt

# Format code with isort and black
format:
	@echo "Sorting imports with isort..."
	@isort app/
	@echo "Formatting code with black..."
	@black app/
	@echo "✨ Code formatting complete!"

# Run linting
lint:
	@echo "Running flake8..."
	@flake8 app/ --max-line-length=120 --exclude=__pycache__
	@echo "Running mypy..."
	@mypy app/ --ignore-missing-imports || true
	@echo "✅ Linting complete!"

# Check formatting and linting without making changes
check:
	@echo "Checking import sorting..."
	@isort --check-only --diff app/ || (echo "::error::Import sorting issues found. Run 'make format' to fix." && exit 1)
	@echo "Checking code formatting..."
	@black --check --diff app/ || (echo "::error::Code formatting issues found. Run 'make format' to fix." && exit 1)
	@echo "Running flake8..."
	@flake8 app/ --max-line-length=120 --exclude=__pycache__
	@echo "✅ All checks passed!"

# Run development server locally
run:
	@echo "Starting development server..."
	@uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests locally
local-test:
	@echo "Running tests with coverage..."
	@pytest -v --cov=app --cov-report=xml --cov-report=term-missing

# Combined commands for CI
ci: check local-test
	@echo "✅ CI checks complete!"

# Format and check
fmt: format check
	@echo "✅ Format and check complete!"