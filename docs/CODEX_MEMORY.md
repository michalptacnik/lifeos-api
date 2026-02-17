# LifeOS API Memory

## Current state
- Runtime: Node 20.
- Auth supports email/password register+login and SSO passthrough from web.
- Internal API security enforced via `INTERNAL_API_KEY` on protected routes.
- Protected route trust boundary now validates `x-user-email` at middleware before domain execution.
- Added `/me` endpoint returning user+household profile.
- Default admin bootstrap exists for development (`admin@lifeos.local`), with stricter startup validation.
- Login lockout/rate limiting is Redis-backed (shared IP+email lockout policy across instances).
- Startup validation now requires `REDIS_URL` so lockout state is not local-only.
- Production v1 runtime surface excludes placeholder endpoints; no `501 Not implemented` routes are exposed.
- Added `/ready` endpoint for dependency readiness (Postgres + Redis), separate from `/health` liveness.
- Production startup now rejects dev bypass env configuration (`ALLOW_DEV_AUTH_BYPASS`/`DEV_AUTH_BYPASS_EMAIL`).
- Inventory domain now supports subtype-aware items (`HOME`, `WORK`, `FOOD`) with quantity/unit semantics.
- Food domain now includes recipe storage with ingredient quantities and deterministic availability checks against `FOOD` inventory items.
- Food inventory now supports guarded stock mutations (`add/use/adjust`) with transactional audit logging and optional expiration dates.
- Matrix integration layer now supports household-scoped room bootstrap, membership sync, and relay hooks for unread counters.

## Key files
- `src/routes/auth.ts`
- `src/services/auth-service.ts`
- `src/services/login-attempt-store.ts`
- `src/routes/me.ts`
- `src/readiness.ts`
- `src/security.ts`
- `src/app.ts`
- `src/domain.ts`
- `src/routes/inventory.ts`
- `src/routes/food.ts`
- `src/routes/matrix.ts`
- `prisma/schema.prisma`
- `src/bootstrap.ts`

## Operational notes
- `INTERNAL_API_KEY` must be strong and shared with web.
- `x-user-email` must be a valid email on all protected routes.
- `REDIS_URL` is required and should point at the shared Redis instance used by all API instances.
- Production should set explicit `ADMIN_PASSWORD` and avoid development defaults.
- Inventory endpoints are household-scoped via `ensureContext` and support subtype filtering.
- Food recipe endpoints are household-scoped via `ensureContext`; availability checks compare normalized ingredient `(name, unit)` against aggregated `FOOD` inventory quantities and return exact shortages.
- Food stock mutation endpoint (`POST /food/stock/:id/mutate`) rejects negative transitions and writes `AuditLog` entries with actor/action/delta payload.
- Matrix endpoints persist `MatrixRoom`, `MatrixIdentity`, `MatrixRoomMembership`, and `MatrixRelayEvent` records for stable client sync contracts.

## Open risks
- Need stronger production-grade auth observability/audit for failed login patterns.
- Redis outage currently blocks login lockout checks (auth availability dependency).
- Recipe ingredient matching currently depends on exact normalized `(name, unit)` strings; no unit conversion or synonym resolution is implemented yet.
- Food availability currently ignores unit conversion; expiration filtering only excludes items with `expiresAt` in the past.
- Matrix relay hook currently updates unread counters by email and expects clients to send canonical unread snapshots.
