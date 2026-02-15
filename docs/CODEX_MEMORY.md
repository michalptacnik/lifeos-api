# LifeOS API Memory

## Current state
- Runtime: Node 20.
- Auth supports email/password register+login and SSO passthrough from web.
- Internal API security enforced via `INTERNAL_API_KEY` on protected routes.
- Added `/me` endpoint returning user+household profile.
- Default admin bootstrap exists for development (`admin@lifeos.local`), with stricter startup validation.
- Login rate limiting is enabled (IP+email lockout policy).

## Key files
- `src/routes/auth.ts`
- `src/services/auth-service.ts`
- `src/routes/me.ts`
- `src/security.ts`
- `src/bootstrap.ts`

## Operational notes
- `INTERNAL_API_KEY` must be strong and shared with web.
- Production should set explicit `ADMIN_PASSWORD` and avoid development defaults.

## Open risks
- Rate limiting is in-memory only (not distributed).
- Need stronger production-grade auth observability/audit for failed login patterns.
