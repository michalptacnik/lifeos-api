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
