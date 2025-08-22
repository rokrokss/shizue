#!/bin/bash

# Simple deployment script for Shizue API

set -e

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Shizue API Deployment Script ===${NC}"

# 1. 환경 변수 확인
echo -e "${YELLOW}Checking environment variables...${NC}"
if [ ! -f .env.production ]; then
    echo -e "${RED}Error: .env.production file not found${NC}"
    echo "Please copy .env.production.example to .env.production and fill in the values"
    exit 1
fi

# 필수 환경 변수 검증
required_vars=("DATABASE_URL" "JWT_SECRET_KEY" "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_SECRET")
for var in "${required_vars[@]}"; do
    if ! grep -q "^$var=" .env.production; then
        echo -e "${RED}Error: $var not set in .env.production${NC}"
        exit 1
    fi
done

# 2. Git 최신 버전 가져오기 (선택사항)
if [ "$1" = "--pull" ]; then
    echo -e "${YELLOW}Pulling latest changes from git...${NC}"
    git pull
fi

# 3. 백업 생성
echo -e "${YELLOW}Creating database backup...${NC}"
./scripts/backup.sh || echo -e "${YELLOW}Warning: Backup failed or no existing database${NC}"

# 4. Docker 이미지 빌드 (캐시 최적화)
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose -f docker-compose.prod.yml build --parallel

# 5. 서비스 중지
echo -e "${YELLOW}Stopping services...${NC}"
docker-compose -f docker-compose.prod.yml down

# 6. 서비스 시작
echo -e "${YELLOW}Starting services...${NC}"
docker-compose -f docker-compose.prod.yml up -d

# 7. 데이터베이스 마이그레이션
echo -e "${YELLOW}Running database migrations...${NC}"
# 데이터베이스 준비 상태 확인
max_attempts=10
attempt=0
until docker-compose -f docker-compose.prod.yml exec -T db pg_isready -U shizue > /dev/null 2>&1; do
    attempt=$((attempt+1))
    if [ $attempt -ge $max_attempts ]; then
        echo -e "${RED}Database failed to start after $max_attempts attempts${NC}"
        exit 1
    fi
    echo "Waiting for database... (attempt $attempt/$max_attempts)"
    sleep 2
done

docker-compose -f docker-compose.prod.yml exec -T api alembic upgrade head

# 8. 헬스 체크 (재시도 로직 포함)
echo -e "${YELLOW}Checking service health...${NC}"
max_health_attempts=5
health_attempt=0
until curl -f http://localhost/health > /dev/null 2>&1; do
    health_attempt=$((health_attempt+1))
    if [ $health_attempt -ge $max_health_attempts ]; then
        echo -e "${RED}Health check failed after $max_health_attempts attempts${NC}"
        echo "Checking logs..."
        docker-compose -f docker-compose.prod.yml logs --tail=50 api
        exit 1
    fi
    echo "Waiting for service to be healthy... (attempt $health_attempt/$max_health_attempts)"
    sleep 3
done
echo -e "${GREEN}Health check passed!${NC}"

# 9. 캐시 워밍업 (선택사항)
if [ "$2" = "--warm-cache" ]; then
    echo -e "${YELLOW}Warming up cache...${NC}"
    curl -X POST http://localhost/admin/cache/warmup > /dev/null 2>&1 || true
fi

# 10. 완료 및 통계
echo -e "${GREEN}=== Deployment completed successfully! ===${NC}"
echo -e "${BLUE}Services running:${NC}"
docker-compose -f docker-compose.prod.yml ps

# 성능 메트릭 표시
echo -e "\n${BLUE}Performance Configuration:${NC}"
echo "• Cache Size: $(grep CACHE_MAX_SIZE .env.production | cut -d= -f2)"
echo "• Cache TTL: $(grep CACHE_DEFAULT_TTL .env.production | cut -d= -f2)s"
echo "• Rate Limits: Auth=$(grep RATE_LIMIT_AUTH .env.production | cut -d= -f2), API=$(grep RATE_LIMIT_API .env.production | cut -d= -f2)"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Check logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "2. View status: docker-compose -f docker-compose.prod.yml ps"
echo "3. Monitor performance: docker stats"
echo "4. Stop services: docker-compose -f docker-compose.prod.yml down"
