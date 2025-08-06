import asyncio
from httpx import AsyncClient
from app.main import app

async def test_api():
    async with AsyncClient(app=app, base_url='http://test') as client:
        # Simple health check
        response = await client.get('/health')
        print(f'Health check: {response.status_code}')
        if response.status_code != 200:
            print(f'Response: {response.text}')

asyncio.run(test_api())
