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

# 2. Git 최신 버전 가져오기 (선택사항)
if [ "$1" = "--pull" ]; then
    echo -e "${YELLOW}Pulling latest changes from git...${NC}"
    git pull
fi

# 3. 백업 생성
echo -e "${YELLOW}Creating database backup...${NC}"
./scripts/backup.sh || echo -e "${YELLOW}Warning: Backup failed or no existing database${NC}"

# 4. Docker 이미지 빌드
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose -f docker-compose.prod.yml build

# 5. 서비스 중지
echo -e "${YELLOW}Stopping services...${NC}"
docker-compose -f docker-compose.prod.yml down

# 6. 서비스 시작
echo -e "${YELLOW}Starting services...${NC}"
docker-compose -f docker-compose.prod.yml up -d

# 7. 데이터베이스 마이그레이션
echo -e "${YELLOW}Running database migrations...${NC}"
sleep 5  # 데이터베이스가 완전히 시작될 때까지 대기
docker-compose -f docker-compose.prod.yml exec -T api alembic upgrade head

# 8. 헬스 체크
echo -e "${YELLOW}Checking service health...${NC}"
sleep 3
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo -e "${GREEN}Health check passed!${NC}"
else
    echo -e "${RED}Health check failed!${NC}"
    echo "Checking logs..."
    docker-compose -f docker-compose.prod.yml logs --tail=50 api
    exit 1
fi

# 9. 완료
echo -e "${GREEN}=== Deployment completed successfully! ===${NC}"
echo -e "${BLUE}Services running:${NC}"
docker-compose -f docker-compose.prod.yml ps

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Check logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "2. View status: docker-compose -f docker-compose.prod.yml ps"
echo "3. Stop services: docker-compose -f docker-compose.prod.yml down"
