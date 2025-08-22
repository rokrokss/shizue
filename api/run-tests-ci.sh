#!/bin/bash
# Run tests with CI environment variables

set -e  # Exit on error

echo "===== CI Test Runner ====="
echo "Starting test run at $(date)"
echo "Python version: $(python --version 2>&1)"
echo "Working directory: $(pwd)"

# Set environment variables (matching GitHub Actions)
export DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test_db"
export JWT_SECRET_KEY="test_secret_key_for_ci"
export GOOGLE_CLIENT_ID="test_client_id"
export GOOGLE_CLIENT_SECRET="test_client_secret"
export GOOGLE_REDIRECT_URI="http://localhost:8000/v1/auth/callback/google"
export CHROME_EXTENSION_ID="test_extension_id"
export CHROME_EXTENSION_REDIRECT_URI="chrome-extension://test_extension_id/callback"
export TESTING="true"

cd accounts-backend

# Check if database is ready (for local testing)
if command -v pg_isready &> /dev/null; then
    echo "Checking PostgreSQL connection..."
    pg_isready -h localhost -p 5432 -U test || echo "Warning: PostgreSQL may not be ready"
fi

# Initialize database
echo "Initializing test database..."
uv run python scripts/init_test_db.py || echo "Warning: Database initialization failed"

# Run tests
echo "Running tests..."
uv run pytest -v \
    --cov=app \
    --cov-report=xml \
    --cov-report=term-missing \
    --tb=short \
    --maxfail=10 \
    || {
        echo "===== Tests Failed ====="
        exit 1
    }

echo "===== Tests Passed Successfully ====="
