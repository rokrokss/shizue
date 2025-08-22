# 구독 시스템 구현 가이드

## 개요
유연한 구독 등급 시스템을 구현했습니다.
이제 Pro, Max, Enterprise 등 다양한 구독 플랜을 동적으로 관리할 수 있습니다.

## 주요 변경사항

### 1. 데이터베이스 구조
```sql
-- 새로운 테이블들
subscription_plans      # 구독 플랜 정의
user_subscriptions      # 사용자-플랜 관계

-- User 테이블 변경
+ subscriptions (Relationship)  # 추가됨
```

### 2. 구독 플랜 구조
```python
SubscriptionPlan:
  - name: 'free', 'pro', 'max', 'enterprise'
  - display_name: 사용자에게 표시되는 이름
  - is_active: 플랜 활성 상태
```

### 3. User 모델 변경
```python
# 현재 (유연한 등급)
if user.subscription_tier == "pro":
    # Pro 기능

if user.has_subscription("pro", "max"):
    # Pro 또는 Max 사용자
```

## 마이그레이션 방법

### 1. 데이터베이스 마이그레이션
```bash
# API 백엔드 디렉토리에서
cd api/accounts-backend

# Python 환경 활성화
source .venv/bin/activate

# 마이그레이션 실행
alembic upgrade head
```

### 2. 초기 데이터 설정
마이그레이션 스크립트가 자동으로 기본 플랜들을 생성:
- 'free' - 무료 플랜
- 'pro' - Pro 플랜
- 'max' - Max 플랜
- 'enterprise' - Enterprise 플랜

## API 엔드포인트

### 구독 플랜 조회
```http
GET /v1/subscriptions/plans
```
응답:
```json
[
  {
    "id": "uuid",
    "name": "free",
    "display_name": "Free",
    "is_active": true
  },
  {
    "id": "uuid",
    "name": "pro",
    "display_name": "Pro",
    "is_active": true
  }
]
```

### 현재 구독 상태 조회
```http
GET /v1/subscriptions/current
```

### 구독 업그레이드/다운그레이드
```http
POST /v1/subscriptions/upgrade
{
  "plan_name": "pro",
  "payment_method": "stripe",
  "payment_id": "pi_xxx"
}
```

### 구독 취소
```http
POST /v1/subscriptions/cancel
```


## 사용 예제

### Python 백엔드에서
```python
# 사용자의 현재 구독 등급 확인
user_tier = user.subscription_tier  # 'free', 'pro', 'max', etc.

# 특정 등급 체크
if user.has_subscription("pro", "max", "enterprise"):
    # 프리미엄 기능 활성화
    enable_premium_features()

```

### 프론트엔드에서
```typescript
// 사용자 프로필 응답
interface UserProfile {
  id: string;
  email: string;
  subscription_tier: 'free' | 'pro' | 'max' | 'enterprise';
}

// 구독 등급별 UI 표시
switch (user.subscription_tier) {
  case 'free':
    showFreeUserUI();
    break;
  case 'pro':
    showProUserUI();
    break;
  case 'max':
    showMaxUserUI();
    break;
}
```

## 새로운 구독 플랜 추가

### 1. 데이터베이스에 플랜 추가
```sql
INSERT INTO subscription_plans (
  id, name, display_name, is_active
) VALUES (
  gen_random_uuid(),
  'student',
  'Student Plan',
  true
);
```

### 2. 코드에서 사용
```python
# 자동으로 사용 가능
if user.subscription_tier == "student":
    # Student 플랜 기능
    pass
```

## 권한 체크 패턴

### 계층적 권한
```python
TIER_HIERARCHY = {
    'free': 0,
    'pro': 1,
    'max': 2,
    'enterprise': 3
}

def has_minimum_tier(user, required_tier):
    user_level = TIER_HIERARCHY.get(user.subscription_tier, 0)
    required_level = TIER_HIERARCHY.get(required_tier, 0)
    return user_level >= required_level

# 사용 예
if has_minimum_tier(user, 'pro'):
    # Pro 이상 등급만 접근 가능
    pass
```

### 플랜 기반 권한
```python
# 플랜 이름으로 권한 체크
if user.subscription_tier in ['pro', 'max', 'enterprise']:
    # 프리미엄 기능 사용 허용
    pass
```

## 주의사항

1. **결제 시스템**: 현재 결제 검증 로직은 구현되지 않았습니다. Stripe, Paddle 등 결제 시스템 통합이 필요합니다.

3. **캐싱**: 구독 정보는 자주 조회되므로 인메모리 캐싱이 적용되어 있습니다.

4. **만료 처리**: 구독 만료 자동 처리를 위한 배치 작업이 필요합니다.

## 테스트

```bash
# 테스트 실행
cd api/accounts-backend
source .venv/bin/activate

# 구독 모델 테스트
pytest tests/test_subscription_models.py -v

# 전체 테스트
pytest
```

## 다음 단계

1. 결제 시스템 통합 (Stripe/Paddle)
2. 구독 만료 알림 시스템
3. 구독 분석 대시보드
4. 프로모션 코드 시스템
5. 기업 계정 관리 기능
