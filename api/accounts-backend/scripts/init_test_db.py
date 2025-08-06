#!/usr/bin/env python
"""Initialize test database for CI environment."""

import asyncio
import os
import sys

# Set testing flag
os.environ["TESTING"] = "true"

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine
from app.core.base import Base


async def init_db():
    """Create all tables in the test database."""
    try:
        print("Initializing test database...")
        async with engine.begin() as conn:
            # Drop all tables first to ensure clean state
            await conn.run_sync(Base.metadata.drop_all)
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
        print("Database initialized successfully")
    except Exception as e:
        print(f"Error initializing database: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init_db())
