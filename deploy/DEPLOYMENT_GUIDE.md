# Shizue Accounts API 배포 가이드

## 목차

1. [사전 준비사항](#사전-준비사항)
2. [환경 설정](#환경-설정)
3. [Kubernetes 배포](#kubernetes-배포)
4. [Helm 배포](#helm-배포)
5. [모니터링 설정](#모니터링-설정)
6. [백업 및 복구](#백업-및-복구)
7. [문제 해결](#문제-해결)

## 사전 준비사항

### 필수 도구

- Kubernetes 클러스터 (1.24+)
- kubectl CLI
- Helm 3.x
- Docker
- cert-manager (TLS 인증서용)
- NGINX Ingress Controller

### Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. APIs & Services → Credentials 이동
4. OAuth 2.0 Client ID 생성
5. Authorized redirect URIs에 추가:
   - `https://api.shizue.app/v1/auth/callback/google`
   - `http://localhost:8000/v1/auth/callback/google` (개발용)

### Chrome Extension ID 확인

1. Chrome 브라우저에서 `chrome://extensions` 접속
2. 개발자 모드 활성화
3. Extension ID 확인 및 복사

## 환경 설정

### 1. 네임스페이스 생성

```bash
kubectl apply -f deploy/k8s/namespace.yaml
```

### 2. Secrets 설정

`deploy/k8s/secret.yaml` 파일을 복사하여 실제 값으로 수정:

```bash
cp deploy/k8s/secret.yaml deploy/k8s/secret-prod.yaml
```

수정해야 할 값들:
- `POSTGRES_PASSWORD`: 강력한 비밀번호
- `REDIS_PASSWORD`: 강력한 비밀번호
- `JWT_SECRET_KEY`: 무작위 생성된 키 (최소 32자)
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret
- `CHROME_EXTENSION_ID`: Chrome Extension ID

비밀번호 생성 예제:
```bash
# JWT Secret Key 생성
openssl rand -base64 32

# Database 비밀번호 생성
openssl rand -base64 24
```

적용:
```bash
kubectl apply -f deploy/k8s/secret-prod.yaml
```

### 3. ConfigMap 설정

필요시 `deploy/k8s/configmap.yaml` 수정 후 적용:

```bash
kubectl apply -f deploy/k8s/configmap.yaml
```

## Kubernetes 배포

### 1. 데이터베이스 배포

```bash
# PostgreSQL 배포
kubectl apply -f deploy/k8s/postgres.yaml

# Redis 배포
kubectl apply -f deploy/k8s/redis.yaml

# 상태 확인
kubectl get pods -n shizue
kubectl get pvc -n shizue
```

### 2. API 배포

```bash
# API 배포
kubectl apply -f deploy/k8s/api-deployment.yaml

# 상태 확인
kubectl get pods -n shizue -l app=shizue-api
kubectl get svc -n shizue
```

### 3. Ingress 설정

cert-manager가 설치되어 있어야 합니다:

```bash
# cert-manager 설치 (아직 없는 경우)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# ClusterIssuer 생성
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Ingress 적용
kubectl apply -f deploy/k8s/ingress.yaml
```

## Helm 배포

### 1. Helm Chart 준비

```bash
cd deploy/helm/shizue-api

# Dependencies 업데이트
helm dependency update
```

### 2. Values 파일 생성

```bash
cp values.yaml values-prod.yaml
```

`values-prod.yaml` 수정:
```yaml
image:
  tag: "v1.0.0"  # 실제 버전 태그 사용

secrets:
  jwtSecretKey: "your-generated-secret"
  googleClientId: "your-google-client-id"
  googleClientSecret: "your-google-client-secret"
  chromeExtensionId: "your-extension-id"

postgresql:
  auth:
    password: "strong-database-password"

redis:
  auth:
    password: "strong-redis-password"
```

### 3. Helm 설치

```bash
# 설치
helm install shizue-api . -f values-prod.yaml -n shizue

# 또는 업그레이드
helm upgrade --install shizue-api . -f values-prod.yaml -n shizue

# 상태 확인
helm status shizue-api -n shizue
```

## 모니터링 설정

### 1. Prometheus & Grafana

```bash
# Prometheus Operator 설치
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

# ServiceMonitor 생성
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: shizue-api
  namespace: shizue
spec:
  selector:
    matchLabels:
      app: shizue-api
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
EOF
```

### 2. 로그 수집 (ELK Stack)

```bash
# Elasticsearch & Kibana 설치
helm repo add elastic https://helm.elastic.co
helm install elasticsearch elastic/elasticsearch -n logging --create-namespace
helm install kibana elastic/kibana -n logging

# Fluentd 설정
kubectl apply -f https://raw.githubusercontent.com/fluent/fluentd-kubernetes-daemonset/master/fluentd-daemonset-elasticsearch.yaml
```

## 백업 및 복구

### 데이터베이스 백업

```bash
# 백업 스크립트
#!/bin/bash
NAMESPACE=shizue
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
POD=$(kubectl get pod -n $NAMESPACE -l app=postgres -o jsonpath="{.items[0].metadata.name}")

# 백업 실행
kubectl exec -n $NAMESPACE $POD -- pg_dump -U shizue shizue_accounts > backup_$TIMESTAMP.sql

# S3에 업로드 (선택사항)
aws s3 cp backup_$TIMESTAMP.sql s3://your-backup-bucket/postgres/
```

### 복구

```bash
# 복구 스크립트
#!/bin/bash
NAMESPACE=shizue
BACKUP_FILE=$1
POD=$(kubectl get pod -n $NAMESPACE -l app=postgres -o jsonpath="{.items[0].metadata.name}")

# 복구 실행
kubectl exec -i -n $NAMESPACE $POD -- psql -U shizue shizue_accounts < $BACKUP_FILE
```

## 문제 해결

### 일반적인 문제들

#### 1. Pod가 시작되지 않음

```bash
# Pod 상태 확인
kubectl describe pod <pod-name> -n shizue

# 로그 확인
kubectl logs <pod-name> -n shizue
```

#### 2. 데이터베이스 연결 실패

```bash
# 데이터베이스 접속 테스트
kubectl run -it --rm debug --image=postgres:15 --restart=Never -n shizue -- psql -h postgres-service -U shizue -d shizue_accounts
```

#### 3. Redis 연결 실패

```bash
# Redis 접속 테스트
kubectl run -it --rm debug --image=redis:7 --restart=Never -n shizue -- redis-cli -h redis-service -a $REDIS_PASSWORD
```

### 성능 튜닝

#### 1. HPA (Horizontal Pod Autoscaler) 조정

```bash
# 현재 HPA 상태
kubectl get hpa -n shizue

# HPA 수정
kubectl edit hpa shizue-api-hpa -n shizue
```

#### 2. 리소스 제한 조정

```yaml
resources:
  limits:
    cpu: 1000m  # 증가
    memory: 1Gi  # 증가
  requests:
    cpu: 500m
    memory: 512Mi
```

### 보안 강화

1. **Network Policies 적용**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: shizue-api-netpol
  namespace: shizue
spec:
  podSelector:
    matchLabels:
      app: shizue-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8000
```

2. **Pod Security Standards**
```bash
kubectl label namespace shizue pod-security.kubernetes.io/enforce=restricted
```

## 업데이트 절차

### 1. 무중단 배포

```bash
# 새 이미지로 업데이트
kubectl set image deployment/shizue-api api=shizue/shizue-accounts-api:v1.0.1 -n shizue

# 롤아웃 상태 확인
kubectl rollout status deployment/shizue-api -n shizue

# 문제 발생 시 롤백
kubectl rollout undo deployment/shizue-api -n shizue
```

### 2. 데이터베이스 마이그레이션

```bash
# 마이그레이션 Job 실행
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration-$(date +%s)
  namespace: shizue
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migration
        image: shizue/shizue-accounts-api:v1.0.1
        command: ["alembic", "upgrade", "head"]
        envFrom:
        - configMapRef:
            name: shizue-api-config
        - secretRef:
            name: shizue-api-secrets
EOF
```

## 프로덕션 체크리스트

- [ ] 모든 Secrets가 강력한 값으로 설정됨
- [ ] TLS 인증서가 올바르게 발급됨
- [ ] 백업 스케줄이 설정됨
- [ ] 모니터링 및 알림이 구성됨
- [ ] 리소스 제한이 적절히 설정됨
- [ ] Network Policies가 적용됨
- [ ] RBAC 권한이 최소 권한으로 설정됨
- [ ] 로그 수집이 작동함
- [ ] 부하 테스트 완료
- [ ] 재해 복구 계획 수립