#!/bin/bash

# Backup script for Shizue API database

set -e

# 설정
BACKUP_DIR="./backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/shizue_backup_$TIMESTAMP.sql"
CONTAINER_NAME="shizue-postgres"
MAX_BACKUPS=7  # 최대 보관할 백업 파일 수

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 백업 디렉토리 생성
mkdir -p $BACKUP_DIR

echo -e "${YELLOW}Starting database backup...${NC}"

# 환경 변수 로드
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
else
    echo -e "${RED}Error: .env.production file not found${NC}"
    exit 1
fi

# 데이터베이스 백업
docker exec $CONTAINER_NAME pg_dump -U $POSTGRES_USER $POSTGRES_DB > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Backup completed: $BACKUP_FILE${NC}"

    # 백업 파일 압축
    gzip $BACKUP_FILE
    echo -e "${GREEN}Backup compressed: ${BACKUP_FILE}.gz${NC}"

    # 오래된 백업 파일 삭제
    echo -e "${YELLOW}Cleaning up old backups...${NC}"
    cd $BACKUP_DIR
    ls -t *.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm
    cd ..

    echo -e "${GREEN}Backup process completed successfully!${NC}"
else
    echo -e "${RED}Backup failed!${NC}"
    exit 1
fi
