#!/bin/bash

# Simple health check and monitoring script

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Shizue API Health Check ===${NC}"
echo -e "Time: $(date)"
echo ""

# 1. Docker 컨테이너 상태
echo -e "${YELLOW}Container Status:${NC}"
docker-compose -f docker-compose.prod.yml ps

# 2. API 헬스 체크
echo -e "\n${YELLOW}API Health:${NC}"
API_HEALTH=$(curl -s http://localhost/health || echo "Failed")
if [[ $API_HEALTH == *"healthy"* ]]; then
    echo -e "${GREEN}✓ API is healthy${NC}"
    echo "$API_HEALTH" | jq '.' 2>/dev/null || echo "$API_HEALTH"
else
    echo -e "${RED}✗ API health check failed${NC}"
fi

# 3. 데이터베이스 연결 체크
echo -e "\n${YELLOW}Database Connection:${NC}"
if docker-compose -f docker-compose.prod.yml exec -T postgres pg_isready > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
    
    # 데이터베이스 크기
    DB_SIZE=$(docker-compose -f docker-compose.prod.yml exec -T postgres psql -U shizue -d shizue_accounts -t -c "SELECT pg_size_pretty(pg_database_size('shizue_accounts'));" | tr -d ' ')
    echo "  Database size: $DB_SIZE"
else
    echo -e "${RED}✗ PostgreSQL is not ready${NC}"
fi

# 4. Redis 연결 체크
echo -e "\n${YELLOW}Redis Connection:${NC}"
if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is ready${NC}"
    
    # Redis 메모리 사용량
    REDIS_MEMORY=$(docker-compose -f docker-compose.prod.yml exec -T redis redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    echo "  Memory usage: $REDIS_MEMORY"
else
    echo -e "${RED}✗ Redis is not ready${NC}"
fi

# 5. 디스크 사용량
echo -e "\n${YELLOW}Disk Usage:${NC}"
df -h | grep -E "^/dev/|Filesystem" | grep -v tmpfs

# 6. 메모리 사용량
echo -e "\n${YELLOW}Memory Usage:${NC}"
free -h

# 7. Docker 리소스 사용량
echo -e "\n${YELLOW}Container Resource Usage:${NC}"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep shizue

# 8. 최근 에러 로그
echo -e "\n${YELLOW}Recent Error Logs (last 10 lines):${NC}"
docker-compose -f docker-compose.prod.yml logs --tail=10 api 2>&1 | grep -E "ERROR|CRITICAL" || echo -e "${GREEN}No recent errors${NC}"

# 9. API 응답 시간 테스트
echo -e "\n${YELLOW}API Response Time:${NC}"
if command -v curl &> /dev/null; then
    RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}\n" http://localhost/health)
    echo "Health endpoint response time: ${RESPONSE_TIME}s"
fi

echo -e "\n${BLUE}=== Health Check Complete ===${NC}"