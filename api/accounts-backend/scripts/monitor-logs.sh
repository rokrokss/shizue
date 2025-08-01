#!/bin/bash

# Simple log monitoring script

# 색상 코드
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${BLUE}=== Shizue API Log Monitor ===${NC}"
echo "Press Ctrl+C to stop"
echo ""

# 실시간 로그 모니터링
docker-compose -f docker-compose.prod.yml logs -f --tail=100 | while read line; do
    # 에러 강조
    if [[ $line == *"ERROR"* ]] || [[ $line == *"CRITICAL"* ]]; then
        echo -e "${RED}$line${NC}"
    # 경고 강조
    elif [[ $line == *"WARNING"* ]] || [[ $line == *"WARN"* ]]; then
        echo -e "${YELLOW}$line${NC}"
    # 성공 메시지 강조
    elif [[ $line == *"success"* ]] || [[ $line == *"200 OK"* ]]; then
        echo -e "${GREEN}$line${NC}"
    # 일반 로그
    else
        echo "$line"
    fi
done
