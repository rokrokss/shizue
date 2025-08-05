# Google OAuth 설정 가이드 (로컬 테스트용)

## 빠른 설정 (개발용)

Google OAuth를 빠르게 설정하려면 다음 단계를 따르세요:

1. **테스트용 OAuth 앱 생성**
   - [Google Cloud Console](https://console.cloud.google.com) 접속
   - 프로젝트 생성 또는 선택
   - "API 및 서비스" → "OAuth 동의 화면" 설정
     - User Type: External
     - 앱 이름: Shizue Dev
     - 지원 이메일: 본인 이메일
     - 테스트 사용자 추가 (본인 이메일)

2. **OAuth 2.0 클라이언트 ID 생성**
   - "사용자 인증 정보" → "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
   - 애플리케이션 유형: 웹 애플리케이션
   - 이름: Shizue Local Dev
   - 승인된 JavaScript 원본:
     - `http://localhost:8000`
     - `http://localhost:3000`
   - 승인된 리디렉션 URI:
     - `http://localhost:8000/v1/auth/callback/google`

3. **.env 파일 업데이트**
   ```bash
   GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-actual-client-secret
   ```

## 주의사항
- 개발 환경에서는 HTTP를 사용해도 됩니다
- 프로덕션에서는 반드시 HTTPS를 사용하세요
- 클라이언트 시크릿은 절대 공개하지 마세요
