#!/bin/bash

# Restore script for Shizue API database

set -e

# 설정
CONTAINER_NAME="shizue-postgres"

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 백업 파일 확인
if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <backup_file>${NC}"
    echo "Example: $0 backup/shizue_backup_20240101_120000.sql.gz"
    exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Starting database restore...${NC}"

# 환경 변수 로드
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
else
    echo -e "${RED}Error: .env.production file not found${NC}"
    exit 1
fi

# 확인 프롬프트
echo -e "${YELLOW}WARNING: This will overwrite the current database!${NC}"
read -p "Are you sure you want to continue? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo -e "${RED}Restore cancelled.${NC}"
    exit 0
fi

# 백업 파일 압축 해제 (필요한 경우)
if [[ $BACKUP_FILE == *.gz ]]; then
    echo -e "${YELLOW}Decompressing backup file...${NC}"
    gunzip -c $BACKUP_FILE > /tmp/restore.sql
    RESTORE_FILE="/tmp/restore.sql"
else
    RESTORE_FILE=$BACKUP_FILE
fi

# 데이터베이스 복원
echo -e "${YELLOW}Restoring database...${NC}"
docker exec -i $CONTAINER_NAME psql -U $POSTGRES_USER $POSTGRES_DB < $RESTORE_FILE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Database restored successfully!${NC}"
    
    # 임시 파일 정리
    if [ "$RESTORE_FILE" = "/tmp/restore.sql" ]; then
        rm $RESTORE_FILE
    fi
else
    echo -e "${RED}Restore failed!${NC}"
    exit 1
fi