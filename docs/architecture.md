# Architecture

Dondie runs as a modular monolith: the agent orchestrates trading through shared infrastructure, always bounded by the risk engine.

## Survival-Centric Request Flow

1. **Dondie scheduler** (or operator manual run) triggers `DondieService.run`.
2. Active brain plans EXECUTE or SKIP (FREE, or STANDARD/PRO LLM when wallet + `DONDIE_LLM_API_KEY` allow).
3. EXECUTE paths call `PlatformService.runAutomation` → signal → risk → order.
4. Paper orders fill via `PaperBrokerAdapter`; live via Alpaca when approved.
5. Trade PnL credits Dondie wallet; brain runs debit wallet (insufficient funds fall back to FREE).
6. Wallet balance determines tier (FREE / STANDARD / PRO); ledger + run memories persist.
7. Operator console reads agent state, wallet ledger, memories, runs, and audit trail.

## Operator Console Flow

1. Next.js web client calls `/api/v1`.
2. NestJS guards validate Supabase/JWT tokens, sessions, and RBAC.
3. Controllers delegate to domain services (`PlatformService`, `DondieService`).
4. Authenticated Socket.IO at `/ws` pushes market, order, trade, and notification events.

## Core Modules

| Module | Role |
|--------|------|
| **Dondie** | Agent: brain selection, wallet, scheduler, tier logic |
| Auth/session | Operator access, MFA |
| Market data | Prices, indicators, watchlists |
| AI signals | Signal generation (FastAPI + fallback) |
| Strategies | Configuration linked to Dondie |
| Automation | Signal → risk → order pipeline |
| Trading | Order/position lifecycle |
| Risk | Pre-trade validation (highest authority) |
| Paper broker | Default execution environment |
| Alpaca broker | Live execution when approved |
| Analytics | Performance metrics for operator |
| Admin | Health, metrics, audit, user provisioning |

## Dondie Components

- `DondieService` — activate, pause, run, scheduled execution
- `DondieBrainFreeService` — Phase 1 brain (signal-based, no LLM cost)
- `DondieScheduler` — in-process interval + immediate boot catch-up tick
- `InternalDondieController` — `POST /internal/dondie/tick` (CRON_SECRET) for overnight wakeups
- `DondieRepository` — agent persistence
- `dondie.config.ts` — survival economics thresholds

AUTOPILOT runs on the API process, not in the browser. External keepalive (GitHub Actions) must call `/internal/dondie/tick` so free-tier cold starts still scan due agents.

Planned:

- Wallet ledger service (PnL credits, brain debits)
- STANDARD/PRO LLM brain services
- Tier upgrade/downgrade from wallet balance
- Agent memory store

## Persistence

- `apps/api/prisma/schema.prisma` — Supabase Postgres entities including `dondie_agents`
- `supabase/migrations` — canonical deployment history
- In-memory store for local/tests when `DATABASE_URL` is unset

## Safety Boundaries

- Risk engine rejects orders Dondie cannot take — no bypass.
- Operator pause stops scheduled runs.
- Paper mode default; live requires `ALLOW_ALPACA_LIVE_TRADING=true`.
- Append-only audit logs for every agent and trading action.

See `docs/dondie-survival-model.md` for survival economics and `docs/risk-controls.md` for risk rules.
