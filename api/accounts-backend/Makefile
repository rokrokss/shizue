.PHONY: help build up down logs shell test clean migrate

# Default target
help:
	@echo "Available commands:"
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