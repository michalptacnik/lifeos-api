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

## 2026-02-17 (P0.2 CI gates + P0.1 scope freeze)
### What changed
- Added API GitHub Actions workflow at `.github/workflows/ci.yml` with install, typecheck, tests, build, and Prisma migration verification against CI Postgres.
- Added Redis CI service and `REDIS_URL` env wiring so auth lockout dependencies are available in CI.
- Restored missing `src/services/login-attempt-store.ts` with in-memory and Redis-backed implementations consumed by `auth-service`.
- Added `redis` dependency in `package.json` so Redis-backed login-attempt store compiles and runs in all environments.
- Removed placeholder runtime endpoints by deleting `src/routes/stubs.ts` and removing `/dashboard` + stub router wiring from `src/app.ts`.
- Updated `README.md` to document explicit v1 shipped routes only.
- Updated `docs/CODEX_MEMORY.md` for Redis-backed lockout and v1 scope changes.

### Why
- Implement production release blockers from the execution plan: enforce CI release gates (P0.2) and remove runtime placeholders from production surface (P0.1).

### Commands/tests run
- `npm ci`
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- Local environment does not have Docker/Postgres, so the CI-only Prisma migration verification step was not executed locally.
- Branch protection updates require authenticated GitHub API access.

### Next steps
- Push this branch and verify `API CI` workflow passes in GitHub Actions.
- Enforce `API CI` as required status check on `main`.

## 2026-02-17 (MVP0 readiness endpoint)
### What changed
- Added `GET /ready` route in `src/app.ts` with explicit readiness output and HTTP 503 when dependencies are not ready.
- Added dependency probe module `src/readiness.ts` to verify Postgres (`SELECT 1`) and Redis (`PING`).
- Wired readiness probe into startup in `src/main.ts`.
- Extended startup validation in `src/security.ts` to require `REDIS_URL`.
- Added readiness route tests in `src/app.test.ts` for ready and not-ready states.
- Updated `.env.example` and `README.md` to include `REDIS_URL` and `/ready` API surface.
- Updated `docs/CODEX_MEMORY.md` with readiness behavior.

### Why
- Implement MVP foundation requirement to distinguish process liveness (`/health`) from dependency readiness (`/ready`) and expose deployment-safe health signals.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- `/ready` currently creates a Redis client per request; this is fine for low-frequency health checks but could be optimized to a shared probe client if check frequency increases.

### Next steps
- Wire deploy platform checks to use `/ready` for readiness and `/health` for liveness.
- Continue with MVP0 auth trust-boundary hardening issue.
