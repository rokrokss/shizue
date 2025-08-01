# Security Policy

## Supported Versions

현재 보안 업데이트를 받는 버전:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

보안 취약점을 발견하신 경우 책임감 있는 공개를 부탁드립니다.

### 보고 방법

1. **이메일**: security@shizue.app
2. **PGP Key**: [공개 키 링크]
3. **응답 시간**: 48시간 이내 초기 응답

### 보고 내용

다음 정보를 포함해 주세요:

- 취약점 유형
- 영향받는 컴포넌트
- 재현 단계
- 잠재적 영향
- 제안하는 수정 방법 (있는 경우)

### 보상 프로그램

심각도에 따른 보상:
- Critical: $500 - $1000
- High: $200 - $500
- Medium: $50 - $200
- Low: Thank you acknowledgment

## Security Measures

### 1. Authentication & Authorization

- **OAuth 2.0**: Google OAuth를 통한 안전한 인증
- **JWT Tokens**:
  - Access Token: 30분 만료
  - Refresh Token: 30일 만료, 데이터베이스 저장
  - 토큰 무효화 지원
- **CORS**: Chrome Extension ID 검증

### 2. Data Protection

- **Encryption**:
  - TLS 1.2+ for all API communications
  - Passwords hashed with bcrypt (12 rounds)
  - Sensitive data encrypted at rest
- **PII Handling**:
  - Minimal data collection
  - Soft delete for user data
  - GDPR compliance

### 3. Infrastructure Security

- **Kubernetes Security**:
  - Network Policies
  - Pod Security Standards
  - RBAC with least privilege
  - Secret management
- **Container Security**:
  - Non-root user
  - Read-only filesystem
  - Minimal base images
  - Regular vulnerability scanning

### 4. API Security

- **Rate Limiting**:
  - Authenticated: 100 requests/minute
  - Unauthenticated: 10 requests/minute
- **Input Validation**:
  - Pydantic models for all inputs
  - SQL injection prevention (SQLAlchemy ORM)
  - XSS protection
- **Error Handling**:
  - Generic error messages
  - No stack traces in production
  - Structured logging

### 5. Dependency Management

- **Automated Updates**: Dependabot for security patches
- **Vulnerability Scanning**:
  - Snyk integration
  - npm audit
  - Safety (Python)
- **License Compliance**: Only approved licenses

## Security Checklist

### Development

- [ ] Code review for all changes
- [ ] Security testing in CI/CD
- [ ] Dependency vulnerability scanning
- [ ] Static code analysis (Bandit)
- [ ] No secrets in code

### Deployment

- [ ] TLS certificates valid
- [ ] Secrets rotated regularly
- [ ] Monitoring configured
- [ ] Backup encryption enabled
- [ ] Network policies applied

### Operations

- [ ] Regular security audits
- [ ] Incident response plan
- [ ] Log monitoring
- [ ] Access control reviews
- [ ] Penetration testing

## Incident Response

### 1. Detection
- Automated monitoring alerts
- User reports
- Security scans

### 2. Assessment
- Severity classification
- Impact analysis
- Root cause identification

### 3. Containment
- Isolate affected systems
- Revoke compromised credentials
- Apply temporary fixes

### 4. Eradication
- Remove vulnerability
- Update systems
- Deploy patches

### 5. Recovery
- Restore services
- Verify fixes
- Monitor for recurrence

### 6. Lessons Learned
- Post-mortem analysis
- Update procedures
- Improve monitoring

## Compliance

### GDPR
- Right to access
- Right to deletion
- Data portability
- Privacy by design

### Security Standards
- OWASP Top 10
- CIS Benchmarks
- NIST Framework

## Contact

- **Security Team**: security@shizue.app
- **Bug Bounty**: https://shizue.app/security/bug-bounty
- **Status Page**: https://status.shizue.app
