# LifeOS API Memory

## Current state
- Runtime: Node 20.
- Auth supports email/password register+login and SSO passthrough from web.
- Internal API security enforced via `INTERNAL_API_KEY` on protected routes.
- Added `/me` endpoint returning user+household profile.
- Default admin bootstrap exists for development (`admin@lifeos.local`), with stricter startup validation.
- Login lockout/rate limiting is Redis-backed (shared IP+email lockout policy across instances).
- Startup validation now requires `REDIS_URL` so lockout state is not local-only.
- Production v1 runtime surface excludes placeholder endpoints; no `501 Not implemented` routes are exposed.

## Key files
- `src/routes/auth.ts`
- `src/services/auth-service.ts`
- `src/services/login-attempt-store.ts`
- `src/routes/me.ts`
- `src/security.ts`
- `src/bootstrap.ts`

## Operational notes
- `INTERNAL_API_KEY` must be strong and shared with web.
- `REDIS_URL` is required and should point at the shared Redis instance used by all API instances.
- Production should set explicit `ADMIN_PASSWORD` and avoid development defaults.

## Open risks
- Need stronger production-grade auth observability/audit for failed login patterns.
- Redis outage currently blocks login lockout checks (auth availability dependency).
