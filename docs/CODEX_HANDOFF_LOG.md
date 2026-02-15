# Codex Handoff Log (API)

## 2026-02-15
### What changed
- Added auth service extraction and auth routes for register/login.
- Added startup security validation and login lockout.
- Added `/me` profile endpoint.

### Why
- Improve auth architecture, security posture, and clearer session profile contract.

### Commands/tests run
- `npm run build`
- `npx vitest run src/services/auth-service.test.ts`

### Known issues/risks
- In-memory lockout state resets on restart.

### Next steps
- Move lockout tracking to shared store (Redis) for multi-instance deployments.
