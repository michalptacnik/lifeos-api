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

## 2026-02-17 (MVP0 auth trust-boundary hardening)
### What changed
- Hardened API middleware in `src/app.ts` to enforce trusted forwarding contract on protected routes:
  - require strong `x-internal-api-key`
  - require `x-user-email`
  - reject malformed `x-user-email` at boundary before route logic
- Added actor email validation helper in `src/security.ts`.
- Updated startup validation in `src/security.ts` to fail in production when dev bypass env vars are configured (`ALLOW_DEV_AUTH_BYPASS` or `DEV_AUTH_BYPASS_EMAIL`).
- Added domain-level defense-in-depth validation in `src/domain.ts` for actor email format.
- Added regression tests:
  - `src/app.test.ts` for missing/invalid actor header handling
  - `src/security.test.ts` for production bypass-env rejection
- Updated `README.md` and `docs/CODEX_MEMORY.md` trust-boundary documentation.

### Why
- Implement MVP0 trust-boundary controls so production identity forwarding assumptions are explicit and validated, with no silent acceptance of unsafe bypass configuration.

### Commands/tests run
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- API still treats possession of `INTERNAL_API_KEY` as sufficient trust for caller identity; this requires private-network ingress controls at deploy layer.

### Next steps
- Align infra ingress/network policy docs to explicitly restrict API internal routes to trusted proxy paths.
- Continue with MVP1 inventory schema/API work after merging foundation PRs.

## 2026-02-17 (MVP1 inventory core API)
### What changed
- Added inventory subtype support in Prisma schema (`InventorySubtype`: `HOME`, `WORK`, `FOOD`) and inventory item fields for `quantity`, `unit`, `createdAt`, `updatedAt`.
- Added migration `prisma/migrations/20260217133000_inventory_subtypes/migration.sql` for enum/columns/index.
- Implemented `src/routes/inventory.ts` with household-scoped CRUD endpoints:
  - `GET /inventory` with optional `subtype` filter
  - `POST /inventory`
  - `PATCH /inventory/:id`
  - `DELETE /inventory/:id`
- Wired inventory routes in `src/app.ts`.
- Extended integration tests in `src/app.test.ts` for inventory create and subtype filtering.
- Updated `README.md` API surface and `docs/CODEX_MEMORY.md` for inventory domain changes.

### Why
- Execute MVP1 inventory core issue by introducing subtype-aware inventory contracts and API endpoints aligned with `home/work/food` mental model.

### Commands/tests run
- `npm run prisma:generate`
- `./node_modules/.bin/tsc --noEmit && npm run test && npm run build`

### Known issues/risks
- `quantity` precision is decimal-backed but currently serialized as `Number`, which may need string serialization for very high precision scenarios.

### Next steps
- Add food-specific fields/flows (recipes and ingredient availability checks) in MVP2.
- Add contract tests for inventory update/delete error paths and invalid subtype query handling.
