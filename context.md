# Context — Dondie Survival Agent

This file is the orientation brief for humans and AI coding agents working in this repository.

Canonical product definition: [`docs/dondie-survival-model.md`](docs/dondie-survival-model.md)  
Agent operating rules: [`08-CLAUDE.md`](08-CLAUDE.md)  
Setup and runbook: [`README.md`](README.md)

---

## What this project is

**Dondie** is an autonomous trading agent that must **trade to fund its own cognition**. This repo is the operator infrastructure for that agent — not a retail trading SaaS and not a multi-tenant consumer product.

The platform provides:

| Layer | Role |
|-------|------|
| Dondie agent | Decision brain, wallet, tiers, scheduler, memory |
| Trading runtime | Signals → risk → orders → fills |
| Risk engine | Hard veto on every order (highest authority) |
| Brokers | Paper by default; Alpaca live only with explicit approval |
| Operator console | Control room for one human operator |

Primary user: a single **operator** who provisions access, connects the broker, sets risk limits, and can pause the agent at any time.

---

## Survival loop (core product)

```text
trade → PnL credit to wallet → spend on brain → tier gates cognition
```

| Tier | Min wallet | Cost/run | Cognition |
|------|------------|----------|-----------|
| FREE | $0 | $0 | Signal-based (no LLM) |
| STANDARD | $25 | $0.05 | LLM (`DONDIE_LLM_STANDARD_MODEL`) |
| PRO | $100 | $0.25 | Advanced LLM (`DONDIE_LLM_PRO_MODEL`) |

- ~`DONDIE_PNL_CREDIT_PERCENT` of realized profit credits the wallet (default 10%).
- Insufficient funds for STANDARD/PRO fall back to FREE.
- Config lives in `apps/api/src/dondie/dondie.config.ts` and `.env`.

---

## Monorepo layout

```text
apps/
  web/          Next.js operator console (Vercel)
  api/          NestJS API + Dondie runtime (Render)
  ai-service/   Python FastAPI signal service
packages/
  shared/       indicators, signal scoring, risk engine, analytics
  types/        shared API/domain contracts
supabase/       migrations (canonical DB history)
infrastructure/ Dockerfiles / compose helpers
docs/           architecture, API, risk, operations
tests/          Playwright e2e and shared test helpers
```

npm workspaces; Node 22+, npm 10+.

---

## Request flow (agent run)

1. Scheduler (`DondieScheduler`) or operator `POST /dondie/run` calls `DondieService.run`.
2. Brain selects EXECUTE or SKIP (FREE / STANDARD / PRO).
3. EXECUTE → `PlatformService.runAutomation` → signal → **risk** → order.
4. Paper fills via `PaperBrokerAdapter`; live via Alpaca when approved.
5. Wallet credits PnL share; debits brain cost; tier updates; memory persisted.
6. Operator console reads state, ledger, memories, runs, and audit trail.

Web client → `NEXT_PUBLIC_API_URL` (`/api/v1`). Realtime: Socket.IO at `/ws`.

---

## Key code locations

| Concern | Path |
|---------|------|
| Dondie agent | `apps/api/src/dondie/` |
| Survival config | `apps/api/src/dondie/dondie.config.ts` |
| Automation pipeline | `apps/api/src/automation/` |
| Risk engine | `apps/api/src/risk/` + `packages/shared` |
| Brokers | `apps/api/src/brokers/` |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Operator UI | `apps/web/src/` |
| Shared types | `packages/types` |
| Deploy API | `render.yaml` |
| Deploy web | `vercel.json` |

---

## Auth, data, and deploy

- **Auth:** Supabase Auth in production (`AUTH_PROVIDER=supabase`). Accounts are admin-provisioned; no public signup.
- **DB:** Supabase Postgres. Migrations in `supabase/migrations`. Local/tests may use in-memory store when `DATABASE_URL` is unset.
- **Web:** Vercel (UI only). Must set `NEXT_PUBLIC_API_URL` to the live API.
- **API:** Render Blueprint (`render.yaml`). Health: `/api/v1/health`. Free instances sleep after idle.
- **Secrets:** never commit; use `.env` / host env vars. Copy from `.env.example`.

---

## Hard rules (do not violate)

1. **Risk engine is highest authority** — no trade bypasses, no silent overrides.
2. **No business logic in frontend** — UI calls the API; domain logic stays in NestJS / shared packages.
3. **Broker access only through the broker abstraction** — never call broker APIs from unrelated services.
4. **Paper before live** — live Alpaca requires `ALLOW_ALPACA_LIVE_TRADING=true` plus operator intent.
5. **Audit everything trading-related** — runs, orders, wallet changes, risk blocks.
6. **Never hardcode credentials** or disable auth/risk for convenience.
7. **Production does not auto-seed** paper brokers, demo balances, or sample watchlists. `ENABLE_E2E_SEED` is Playwright-only.

---

## Operator console surfaces

1. **Dondie** — status, wallet, tier, run controls
2. **Market** — prices, indicators, watchlists
3. **Strategies** — strategy linked to the agent
4. **Risk & Alerts** — capital limits
5. **Simulation Lab** — backtests
6. **Admin** — users, health, audit (admin role)

---

## Primary Dondie API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dondie` | Agent state or `null` |
| POST | `/dondie/activate` | Start agent (`strategyId`), FREE tier |
| POST | `/dondie/pause` / `/resume` | Kill switch |
| POST | `/dondie/run` | Manual run |
| GET | `/dondie/wallet` | Balance, tier, ledger |
| GET | `/dondie/memories` | Run memories |
| POST | `/dondie/universe` | Symbol universe |

Full API: [`docs/api.md`](docs/api.md)

---

## Implementation status

| Capability | Status |
|------------|--------|
| FREE brain + scheduler | Implemented |
| Wallet credits/debits + ledger | Implemented |
| Tier upgrade/downgrade | Implemented |
| STANDARD / PRO LLM brains | Implemented (needs `DONDIE_LLM_API_KEY`) |
| Run memory + symbol universe | Implemented |
| Paper trading default | Implemented |
| Live Alpaca (gated) | Implemented behind safety flags |

---

## Local commands

```bash
npm install
cp .env.example .env   # fill secrets
npm run dev            # API :3001, web :3000
npm run lint && npm run test && npm run test:e2e && npm run build
# or: npm run validate
```

DB (Supabase CLI): `npm run db:link` → `npm run db:push` → `npm run seed`  
Containers: `docker compose up --build`

---

## Doc map

| Doc | Use when |
|-----|----------|
| [`docs/dondie-survival-model.md`](docs/dondie-survival-model.md) | Product / economics truth |
| [`docs/architecture.md`](docs/architecture.md) | System design |
| [`docs/api.md`](docs/api.md) | HTTP contracts |
| [`docs/risk-controls.md`](docs/risk-controls.md) | Risk rules |
| [`docs/paper-trading-validation.md`](docs/paper-trading-validation.md) | Live-capital gate |
| [`docs/operations.md`](docs/operations.md) | Ops / runbooks |
| [`01-project-vision.md`](01-project-vision.md) | Vision |
| [`02-mvp-scope.md`](02-mvp-scope.md) | MVP boundaries |
| [`08-CLAUDE.md`](08-CLAUDE.md) | Contributor / AI coding rules |
| [`12-prd-product-requirements-document.md`](12-prd-product-requirements-document.md) | PRD |

---

## When changing code

- Prefer the smallest change that preserves the survival loop and risk authority.
- Update docs when behavior, env vars, or API contracts change.
- Add or extend tests for trading, wallet, risk, and auth paths you touch.
- Keep TypeScript strict; avoid `any`. Prefer explicit return types in API code.
