#!/bin/bash

# Server installation script for Ubuntu/Debian

set -e

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Shizue API Server Setup ===${NC}"

# Root 권한 확인
if [ "$EUID" -ne 0 ]; then
   echo -e "${RED}Please run as root (use sudo)${NC}"
   exit 1
fi

# 1. 시스템 업데이트
echo -e "${YELLOW}Updating system packages...${NC}"
apt update && apt upgrade -y

# 2. 필요한 패키지 설치
echo -e "${YELLOW}Installing required packages...${NC}"
apt install -y \
    curl \
    git \
    ufw \
    nginx \
    certbot \
    python3-certbot-nginx \
    htop \
    ncdu \
    jq

# 3. Docker 설치
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

# 4. Docker Compose 설치
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
else
    echo -e "${GREEN}Docker Compose already installed${NC}"
fi

# 5. 방화벽 설정
echo -e "${YELLOW}Configuring firewall...${NC}"
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
echo "y" | ufw enable

# 6. 프로젝트 디렉토리 생성
echo -e "${YELLOW}Creating project directory...${NC}"
mkdir -p /opt/shizue
cd /opt/shizue

# 7. Swap 파일 생성 (메모리가 적은 경우)
MEMORY=$(free -m | awk 'NR==2{print $2}')
if [ $MEMORY -lt 2048 ]; then
    echo -e "${YELLOW}Creating swap file...${NC}"
    if [ ! -f /swapfile ]; then
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        echo -e "${GREEN}2GB swap file created${NC}"
    fi
fi

# 8. 사용자 생성
if ! id -u shizue > /dev/null 2>&1; then
    echo -e "${YELLOW}Creating shizue user...${NC}"
    useradd -m -s /bin/bash shizue
    usermod -aG docker shizue
fi

# 9. 자동 시작 설정
echo -e "${YELLOW}Setting up systemd service...${NC}"
if [ -f /opt/shizue/api/accounts-backend/scripts/shizue-api.service ]; then
    cp /opt/shizue/api/accounts-backend/scripts/shizue-api.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable shizue-api.service
    echo -e "${GREEN}Systemd service configured${NC}"
fi

# 10. Cron 백업 설정
echo -e "${YELLOW}Setting up automated backups...${NC}"
cat > /etc/cron.d/shizue-backup << EOF
# Shizue API daily backup at 3 AM
0 3 * * * shizue cd /opt/shizue/api/accounts-backend && ./scripts/backup.sh >> /var/log/shizue-backup.log 2>&1
EOF

# 11. 로그 로테이션 설정
echo -e "${YELLOW}Setting up log rotation...${NC}"
cat > /etc/logrotate.d/shizue << EOF
/var/log/shizue*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 shizue shizue
}
EOF

# 12. 완료
echo -e "${GREEN}=== Server setup completed! ===${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Clone your project: git clone <your-repo> /opt/shizue"
echo "2. Set up environment: cd /opt/shizue/api/accounts-backend && cp .env.production.example .env.production"
echo "3. Edit environment variables: nano .env.production"
echo "4. Deploy: ./scripts/deploy.sh"
echo "5. Set up SSL: certbot --nginx -d api.shizue.app"
echo ""
echo -e "${BLUE}Server information:${NC}"
echo "- Docker version: $(docker --version)"
echo "- Docker Compose version: $(docker-compose --version)"
echo "- Memory: $(free -h | awk 'NR==2{print $2}')"
echo "- Disk: $(df -h / | awk 'NR==2{print $4}' | tr -d ' ') available"
