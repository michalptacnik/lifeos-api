# LifeOS API

Modular monolith backend for LifeOS using Node.js, TypeScript, Express, Prisma, and PostgreSQL.

## V1 Surface
- `GET /health` (liveness)
- `GET /ready` (readiness: DB + Redis)
- `POST /auth/register`
- `POST /auth/login`
- `GET /me`
- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`
- `GET /inventory`
- `POST /inventory`
- `PATCH /inventory/:id`
- `DELETE /inventory/:id`
- `GET /food/recipes`
- `POST /food/recipes`
- `PATCH /food/recipes/:id`
- `DELETE /food/recipes/:id`
- `GET /food/recipes/:id/availability`
- `POST /food/stock/:id/mutate`
- `GET /matrix/rooms`
- `POST /matrix/rooms/bootstrap`
- `POST /matrix/rooms/:roomId/sync-membership`
- `POST /matrix/rooms/:roomId/relay`
- `GET /worktime`
- `POST /worktime/start`
- `POST /worktime/stop`
- `PATCH /worktime/:id`
- `GET /automation/activity`
- `POST /automation/plan-day`
- `GET /calendar/tasks.ics`

Non-v1 placeholder endpoints are intentionally not exposed in runtime.

## Quick Start
```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

## Internal trust boundary
- Protected routes require both `x-internal-api-key` and `x-user-email` headers.
- `x-user-email` must be a valid email; malformed or missing values are rejected at API boundary.
- Production startup fails if dev bypass env vars are configured (`ALLOW_DEV_AUTH_BYPASS=true` or non-empty `DEV_AUTH_BYPASS_EMAIL`).
- Food stock mutations are transaction-backed and emit audit records with actor + delta metadata.
- Matrix routes are household-scoped and persist room/user mappings, membership sync state, and relay unread counters.
