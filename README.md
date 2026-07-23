# Dondie — Autonomous Survival Agent

Operator infrastructure for **Dondie**, an autonomous trading agent that must **trade to fund its own cognition**. This is not a retail trading app — it is the runtime, risk shell, and control room for one survival agent.

## What Dondie Is

Dondie trades markets autonomously, earns wallet balance from PnL, and spends that balance on tiered "brains" (decision engines):

| Tier | Min wallet | Cost/run | Cognition |
|------|------------|----------|-----------|
| FREE | $0 | $0 | Signal-based |
| STANDARD | $25 | $0.05 | LLM-assisted (`DONDIE_LLM_STANDARD_MODEL`) |
| PRO | $100 | $0.25 | Advanced LLM (`DONDIE_LLM_PRO_MODEL`) |

See [`docs/dondie-survival-model.md`](docs/dondie-survival-model.md) for the full survival economics definition.

## Stack

- `apps/web` — Operator console (Next.js, React, TypeScript, TailwindCSS)
- `apps/api` — NestJS API, Dondie agent, trading/risk/audit modules
- `apps/ai-service` — Python FastAPI signal service
- `packages/shared` — indicators, signal scoring, risk engine, analytics
- `packages/types` — shared API/domain contracts
- `infrastructure` — Dockerfiles and compose services

## Prerequisites

- Node.js 22+
- npm 10+
- A Supabase project and its database password
- Docker Desktop only when running the API, web, and AI service containers
- Python 3.12 only if running `apps/ai-service` outside Docker

## Environment

Copy `.env.example` to `.env` and set real values. The operator handles env setup — see Dondie-specific vars below.

Required production values:

- `DATABASE_URL`
- `SUPABASE_DB_PASSWORD` for CLI migration commands
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (legacy auth only)
- `MFA_ENCRYPTION_KEY`
- `BROKER_CREDENTIAL_ENCRYPTION_KEY`
- `NEXT_PUBLIC_API_URL`
- `AI_SERVICE_URL`

Dondie survival economics (optional — defaults in `dondie.config.ts`):

- `DONDIE_SCHEDULE_MINUTES` (default `60`)
- `DONDIE_SCHEDULER_ENABLED` (default `true`)
- `DONDIE_STANDARD_MIN_BALANCE` / `DONDIE_PRO_MIN_BALANCE`
- `DONDIE_STANDARD_BRAIN_COST_USD` / `DONDIE_PRO_BRAIN_COST_USD`
- `DONDIE_PNL_CREDIT_PERCENT`
- `DONDIE_LLM_API_URL` / `DONDIE_LLM_API_KEY`
- `DONDIE_LLM_STANDARD_MODEL` / `DONDIE_LLM_PRO_MODEL`

Broker (required for market data unless operator connects Alpaca in console):

- `ALPACA_API_KEY` / `ALPACA_SECRET_KEY`
- `ALPACA_ENVIRONMENT` (`PAPER` or `LIVE`, default `PAPER`)
- `ALLOW_ALPACA_LIVE_TRADING=true` (required before live orders)

Do not commit real secrets.

## Install

```bash
npm install
```

## Database

Prisma schema: `apps/api/prisma/schema.prisma`. Supabase migrations: `supabase/migrations`.

```powershell
npm run db:link
$env:SUPABASE_DB_PASSWORD="<project-database-password>"
npm run db:push
$env:DATABASE_URL="<supabase-session-pooler-url>"
$env:SEED_ADMIN_EMAIL="admin@example.com"
$env:SEED_ADMIN_PASSWORD="<set-locally>"
npm run seed
```

## Run Locally

```bash
npm run dev
```

Operator console: `http://localhost:3000`. API: `http://localhost:3001/api/v1`.

Full container stack:

```bash
docker compose up --build
```

## Operator Console

The web UI is organized around Dondie:

1. **Dondie** — agent status, wallet, tier, run controls, portfolio metrics
2. **Market** — prices, indicators, watchlists (agent's eyes)
3. **Strategies** — strategy linked to Dondie
4. **Risk & Alerts** — capital preservation limits
5. **Simulation Lab** — backtests before live activation
6. **Admin** — user provisioning, health, audit (admin role)

## Dondie API

- `GET /dondie` — agent state or `null`
- `POST /dondie/activate` — requires `strategyId`; starts on FREE tier
- `POST /dondie/pause` / `POST /dondie/resume`
- `POST /dondie/run` — manual run (optional `symbol`, `timeframe`)

Full API summary: [`docs/api.md`](docs/api.md)

## Tests

```bash
npm run lint
npm run test
npm run test:e2e
npm run build
npm run validate
```

Playwright E2E covers operator login, Dondie activation, paper trades, risk blocks, and audit visibility.

## Safety Guarantees

- Every trade passes through the risk engine before broker execution.
- Paper trading is the default; live requires explicit env approval.
- Dondie runs only when ACTIVE; operator can pause at any time.
- All agent runs, orders, and wallet changes produce audit records.
- Broker credentials encrypted; MFA supported.

See `docs/risk-controls.md`, `docs/paper-trading-validation.md`, and `docs/requirements-traceability.md`.

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/dondie-survival-model.md`](docs/dondie-survival-model.md) | Canonical survival economics |
| [`01-project-vision.md`](01-project-vision.md) | Product vision |
| [`02-mvp-scope.md`](02-mvp-scope.md) | MVP scope |
| [`12-prd-product-requirements-document.md`](12-prd-product-requirements-document.md) | PRD |
| [`docs/architecture.md`](docs/architecture.md) | Technical architecture |
