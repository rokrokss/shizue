#!/bin/bash

# ACCOUNTS 구현 테스트 스크립트
# 이 스크립트는 로컬 환경에서 인증 플로우를 테스트합니다

API_URL="http://localhost:8000"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Shizue ACCOUNTS 테스트 시작"
echo "================================"

# 1. API 서버 상태 확인
echo -e "\n${YELLOW}1. API 서버 상태 확인${NC}"
if curl -s "$API_URL/" | grep -q "Shizue Accounts API"; then
    echo -e "${GREEN}✓ API 서버가 실행 중입니다${NC}"
else
    echo -e "${RED}✗ API 서버가 실행되지 않습니다. 먼저 서버를 시작하세요.${NC}"
    exit 1
fi

# 2. Google OAuth URL 가져오기
echo -e "\n${YELLOW}2. Google OAuth URL 테스트${NC}"
AUTH_URL=$(curl -s "$API_URL/v1/auth/login/google" | jq -r '.authorization_url // empty')

if [ -n "$AUTH_URL" ]; then
    echo -e "${GREEN}✓ OAuth URL 생성 성공${NC}"
    echo "   URL: ${AUTH_URL:0:50}..."
else
    echo -e "${RED}✗ OAuth URL 생성 실패${NC}"
fi

# 3. API 엔드포인트 테스트
echo -e "\n${YELLOW}3. API 엔드포인트 확인${NC}"

# 인증이 필요없는 엔드포인트
echo "- Health check:"
curl -s -o /dev/null -w "  Status: %{http_code}\n" "$API_URL/"

echo "- OpenAPI 문서:"
curl -s -o /dev/null -w "  Status: %{http_code}\n" "$API_URL/openapi.json"

# 4. 인증이 필요한 엔드포인트 (401 예상)
echo -e "\n${YELLOW}4. 인증 필요 엔드포인트 (401 예상)${NC}"

echo "- 사용자 정보:"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/v1/users/me")
STATUS=$(echo "$RESPONSE" | tail -n1)
if [ "$STATUS" = "401" ]; then
    echo -e "  ${GREEN}✓ 예상대로 401 Unauthorized${NC}"
else
    echo -e "  ${RED}✗ 예상치 못한 상태 코드: $STATUS${NC}"
fi

# 5. 데이터베이스 연결 확인
echo -e "\n${YELLOW}5. 데이터베이스 연결 확인${NC}"
if docker ps | grep -q "shizue-postgres"; then
    echo -e "${GREEN}✓ PostgreSQL 컨테이너 실행 중${NC}"
else
    echo -e "${RED}✗ PostgreSQL 컨테이너가 실행되지 않습니다${NC}"
fi

if docker ps | grep -q "shizue-redis"; then
    echo -e "${GREEN}✓ Redis 컨테이너 실행 중${NC}"
else
    echo -e "${RED}✗ Redis 컨테이너가 실행되지 않습니다${NC}"
fi

# 6. Chrome Extension 빌드 확인
echo -e "\n${YELLOW}6. Chrome Extension 빌드 확인${NC}"
if [ -f "dist/chrome-mv3/manifest.json" ]; then
    echo -e "${GREEN}✓ Extension 빌드 완료${NC}"

    # host_permissions 확인
    if grep -q "http://localhost:8000" dist/chrome-mv3/manifest.json; then
        echo -e "${GREEN}✓ localhost:8000 host permission 설정됨${NC}"
    else
        echo -e "${RED}✗ host_permissions에 localhost:8000이 없습니다${NC}"
    fi
else
    echo -e "${RED}✗ Extension이 빌드되지 않았습니다. 'pnpm build' 실행 필요${NC}"
fi

echo -e "\n================================"
echo "📋 테스트 요약"
echo "================================"
echo "✅ 완료된 작업:"
echo "   - API 서버 실행"
echo "   - 데이터베이스 설정"
echo "   - Extension 빌드"
echo ""
echo "⚠️  수동 테스트 필요:"
echo "   1. Google OAuth 클라이언트 ID/Secret 설정"
echo "   2. Chrome에서 Extension 로드"
echo "   3. 로그인 플로우 테스트"
echo "   4. API Key 입력 및 동기화"
echo ""
echo "🔗 유용한 링크:"
echo "   - API 문서: http://localhost:8000/docs"
echo "   - PostgreSQL: localhost:5432 (shizue / shizue_password)"
echo "   - Redis: localhost:6379"
