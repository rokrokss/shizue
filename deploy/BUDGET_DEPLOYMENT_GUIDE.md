# 저예산 배포 가이드

Shizue Accounts API를 무료 또는 저렴하게 배포하는 방법들입니다.

## 목차

1. [무료 배포 옵션](#무료-배포-옵션)
2. [저렴한 VPS 옵션](#저렴한-vps-옵션)
3. [Railway 배포](#railway-배포)
4. [Render 배포](#render-배포)
5. [Oracle Cloud 무료 티어](#oracle-cloud-무료-티어)
6. [자동 백업 설정](#자동-백업-설정)

## 무료 배포 옵션

### 1. Railway (추천) 🚂

**장점**: Docker 지원, 자동 HTTPS, 간단한 배포
**제한**: 월 $5 크레딧 (약 500시간)

#### 배포 방법:

1. [Railway](https://railway.app) 가입
2. GitHub 연동
3. 새 프로젝트 생성
4. PostgreSQL과 Redis 추가:
   ```bash
   # Railway CLI 설치
   npm install -g @railway/cli

   # 로그인
   railway login

   # 프로젝트 생성
   railway init

   # PostgreSQL 추가
   railway add postgresql

   # Redis 추가
   railway add redis
   ```

5. 환경 변수 설정:
   ```bash
   railway variables set JWT_SECRET_KEY="your-secret-key"
   railway variables set GOOGLE_CLIENT_ID="your-client-id"
   railway variables set GOOGLE_CLIENT_SECRET="your-client-secret"
   # ... 기타 환경 변수
   ```

6. 배포:
   ```bash
   railway up
   ```

### 2. Render 🎨

**장점**: 무료 PostgreSQL, 자동 배포
**제한**: 15분 비활성시 슬립, 제한된 빌드 시간

#### 배포 방법:

1. `render.yaml` 생성:
```yaml
services:
  - type: web
    name: shizue-api
    env: docker
    dockerfilePath: ./api/accounts-backend/Dockerfile
    dockerContext: ./api/accounts-backend
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: shizue-db
          property: connectionString
      - key: JWT_SECRET_KEY
        generateValue: true
      # 기타 환경 변수

databases:
  - name: shizue-db
    plan: free
```

2. [Render](https://render.com)에서 배포

### 3. Fly.io 🪰

**장점**: 전 세계 엣지 배포, 무료 티어
**제한**: 제한된 리소스

#### 배포 방법:

1. Fly CLI 설치:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. `fly.toml` 생성:
```toml
app = "shizue-api"

[build]
  dockerfile = "api/accounts-backend/Dockerfile"

[env]
  PORT = "8000"

[experimental]
  allowed_public_ports = []
  auto_rollback = true

[[services]]
  http_checks = []
  internal_port = 8000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

3. 배포:
   ```bash
   fly launch
   fly secrets set JWT_SECRET_KEY="your-secret"
   ```

## 저렴한 VPS 옵션

### 1. Hetzner Cloud (추천) 💶

**가격**: 월 €4.51 (약 6,000원)
**스펙**: 2 vCPU, 2GB RAM, 40GB SSD

#### 설정 방법:

```bash
# 서버에 SSH 접속 후
sudo apt update && sudo apt upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 프로젝트 클론
git clone https://github.com/your-repo/shizue.git
cd shizue/api/accounts-backend

# 환경 변수 설정
cp .env.production.example .env.production
nano .env.production  # 값 입력

# 배포
./scripts/deploy.sh
```

### 2. Vultr 🌍

**가격**: 월 $6 (약 8,000원)
**스펙**: 1 vCPU, 1GB RAM, 25GB SSD

### 3. DigitalOcean 💧

**가격**: 월 $6 (신규 가입시 $200 크레딧)
**스펙**: 1 vCPU, 1GB RAM, 25GB SSD

## Oracle Cloud 무료 티어

**완전 무료**, 영구적으로 사용 가능!

### 리소스:
- 2 AMD VM (각 1 OCPU, 1GB RAM)
- 4 ARM VM (총 4 OCPU, 24GB RAM) - 추천!
- 200GB 블록 스토리지

### 설정 방법:

1. [Oracle Cloud](https://cloud.oracle.com) 가입
2. ARM 기반 VM 인스턴스 생성 (Ubuntu 22.04)
3. 보안 그룹에서 포트 80, 443 열기
4. Docker 설치 및 배포:

```bash
# ARM용 Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 나머지는 Hetzner와 동일
```

## Railway 배포 (상세)

Railway가 가장 간단하므로 자세히 설명합니다:

### 1. 프로젝트 구조 수정

`railway.json` 생성:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "api/accounts-backend/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### 2. 환경 변수 템플릿

Railway 대시보드에서 설정:
```
DATABASE_URL=${{POSTGRES.DATABASE_URL}}
REDIS_URL=${{REDIS.REDIS_URL}}
JWT_SECRET_KEY=<generate-random-key>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://<your-app>.railway.app/v1/auth/callback/google
CHROME_EXTENSION_ID=<your-extension-id>
```

### 3. 자동 마이그레이션

`Dockerfile` 수정:
```dockerfile
# 마지막에 추가
COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
```

`scripts/start.sh` 생성:
```bash
#!/bin/sh
# Run migrations
alembic upgrade head
# Start app
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

## Render 배포 (상세)

### 1. Build 스크립트

`render-build.sh` 생성:
```bash
#!/bin/bash
cd api/accounts-backend
pip install -r requirements.txt
alembic upgrade head
```

### 2. Start 명령

Render 대시보드에서:
```
cd api/accounts-backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## 자동 백업 설정

### 1. Cron 작업 (VPS용)

```bash
# Crontab 편집
crontab -e

# 매일 새벽 3시 백업
0 3 * * * cd /path/to/project && ./scripts/backup.sh >> /var/log/shizue-backup.log 2>&1
```

### 2. GitHub Actions 백업

`.github/workflows/backup.yml`:
```yaml
name: Database Backup

on:
  schedule:
    - cron: '0 3 * * *'  # 매일 새벽 3시 (UTC)
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Backup Database
      env:
        DATABASE_URL: ${{ secrets.DATABASE_URL }}
      run: |
        # pg_dump 실행
        pg_dump $DATABASE_URL > backup.sql

    - name: Upload to S3/Google Drive
      # S3 또는 Google Drive에 업로드
```

## 도메인 설정

### 무료 도메인 옵션:
1. **Freenom**: .tk, .ml 등 무료 도메인
2. **DuckDNS**: 무료 서브도메인
3. **No-IP**: 동적 DNS 서비스

### Cloudflare 설정 (추천):
1. Cloudflare 가입 (무료)
2. 도메인 추가
3. DNS 설정:
   ```
   A    api    your-server-ip
   ```
4. SSL/TLS 설정: "Full" 모드
5. 추가 보안 기능 활성화

## 비용 최적화 팁

1. **PostgreSQL 최적화**:
   ```sql
   -- 자동 VACUUM 설정
   ALTER DATABASE shizue_accounts SET autovacuum_vacuum_scale_factor = 0.1;
   ```

2. **Redis 메모리 최적화**:
   ```
   maxmemory 100mb
   maxmemory-policy allkeys-lru
   ```

3. **로그 로테이션**:
   ```bash
   # /etc/logrotate.d/shizue
   /var/log/shizue/*.log {
       daily
       rotate 7
       compress
       missingok
       notifempty
   }
   ```

## 모니터링 (무료)

### 1. UptimeRobot
- 5분마다 헬스 체크
- 다운타임 알림
- 무료 50개 모니터

### 2. Healthchecks.io
- Cron 작업 모니터링
- 백업 실패 알림

### 3. 간단한 상태 페이지

`status.html`:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Shizue API Status</title>
    <meta http-equiv="refresh" content="30">
</head>
<body>
    <h1>API Status</h1>
    <div id="status">Checking...</div>
    <script>
        fetch('/health')
            .then(r => r.json())
            .then(data => {
                document.getElementById('status').innerHTML =
                    `✅ API is ${data.status}`;
            })
            .catch(() => {
                document.getElementById('status').innerHTML =
                    '❌ API is down';
            });
    </script>
</body>
</html>
```

## 트러블슈팅

### 메모리 부족
```bash
# Swap 추가 (VPS)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 디스크 공간 부족
```bash
# Docker 정리
docker system prune -a -f
docker volume prune -f
```

### 느린 응답
- Redis 캐시 확인
- 데이터베이스 인덱스 최적화
- CDN 사용 (Cloudflare)

## 결론

추천 순서:
1. **개발/테스트**: Railway (간단함)
2. **프로덕션 (무료)**: Oracle Cloud ARM
3. **프로덕션 (유료)**: Hetzner Cloud

시작은 Railway로 하고, 트래픽이 늘면 VPS로 이전하는 것을 추천합니다!
