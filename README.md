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
- `DONDIE_WEEKEND_EARN_ENABLED` (default `true` — Sat/Sun crypto desk wallet credits)
- `DONDIE_WEEKEND_EARN_BASE_USD` / `DONDIE_WEEKEND_EARN_MAX_PER_DAY_USD`
- `DONDIE_LLM_API_URL` / `DONDIE_LLM_API_KEY`
- `DONDIE_LLM_STANDARD_MODEL` / `DONDIE_LLM_PRO_MODEL`
- `DONDIE_NFP_ONLY` (default `false` — Dondie trades every qualifying breakout signal, any day; set to `true` to restrict orders to the monthly US Non-Farm Payrolls release window)
- `DONDIE_NFP_WINDOW_MINUTES_BEFORE` / `DONDIE_NFP_WINDOW_MINUTES_AFTER` (default `15` / `120` — minutes around the 8:30am ET NFP print during which execution is allowed)

Broker (required for market data and order routing — connect in Settings or set env):

- `ALPACA_API_KEY` / `ALPACA_SECRET_KEY`
- `ALPACA_ENVIRONMENT` (`PAPER` or `LIVE`, default `PAPER`)
- `ALLOW_ALPACA_LIVE_TRADING=true` (required before live orders)

Production does **not** auto-seed PAPER broker accounts, demo balances, or sample watchlists.
`ENABLE_E2E_SEED` is Playwright-only and must stay unset/false in production.

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

`npm run seed` creates the admin user plus empty portfolio / risk / watchlist rows only — never a connected PAPER broker.

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

## Operator login (Vercel + Supabase)

Vercel only hosts the **web** UI. Login needs:

1. **Supabase Auth user** (not just a row in `public.users`)
2. A live **API** URL in Vercel (`NEXT_PUBLIC_API_URL`)

### 1) Create the Auth user (Dashboard)

Supabase → **Authentication** → **Users** → **Add user** → Email + password  
(Use the same email you want to log in with. Mark email confirmed.)

Then promote in SQL Editor:

```sql
UPDATE public.users
SET role = 'ADMIN', status = 'ACTIVE', updated_at = now()
WHERE email = lower('your@email.com');
```

### 2) Deploy the API (Render)

Use the Blueprint in `render.yaml`, or create a Node Web Service from this repo:

- Build: `npm ci && npm run build:packages && npm run prisma:generate -w @trading/api && npm run build -w @trading/api`
- Start: `npm run start -w @trading/api`
- Health check: `/api/v1/health`

Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and Supabase public URL/key on the service.

### 3) Point Vercel at the API

Vercel → Project → Settings → Environment Variables (Production + Preview):

- `NEXT_PUBLIC_API_URL` = `https://<your-api>.onrender.com/api/v1`
- `NEXT_PUBLIC_SUPABASE_URL` = `https://axrclxwittqyurwqjvdq.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = (Dashboard → Settings → API)

Redeploy the web app after saving.

### Overnight AUTOPILOT (no browser required)

Dondie scans on the **API server**, not in your phone tab. Free Render APIs still sleep after ~15 minutes idle, so keep them awake **and** tick overdue agents:

1. Set the same `CRON_SECRET` on the Render `dondie-api` service and as a GitHub Actions **repository secret** named `CRON_SECRET`.
2. `.github/workflows/render-api-keepalive.yml` runs every ~12 minutes: wakes `/api/v1/health`, then `POST /api/v1/internal/dondie/tick`.
3. On every API boot/wake, the in-process scheduler also catch-up ticks immediately (default every 15 minutes via `DONDIE_SCHEDULE_MINUTES`).

“Force scan now” in the UI is optional — closing the tab must not stop AUTOPILOT once `CRON_SECRET` is configured.

## Tests

```bash
npm run lint
npm run test
npm run test:e2e
npm run build
npm run validate
```

Playwright E2E covers operator login, Dondie activation, paper trades, risk blocks, and audit visibility.

## Supabase free-plan keepalive

Free Supabase projects pause after ~7 days without DB activity. This repo includes `.github/workflows/supabase-keepalive.yml`, which pings the project three times a week.

Add these **GitHub Actions secrets** (Settings → Secrets and variables → Actions):

- `SUPABASE_URL` — e.g. `https://axrclxwittqyurwqjvdq.supabase.co`
- `SUPABASE_ANON_KEY` — Dashboard → Project Settings → API → anon / publishable key

Then run **Actions → Supabase keepalive → Run workflow** once to verify. Paid (Pro+) projects never auto-pause.

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
