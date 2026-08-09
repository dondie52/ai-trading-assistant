# API Summary

All routes are versioned under `/api/v1`. The API serves the **Dondie operator console** and the **agent runtime** — not a public consumer product.

Response envelope:

```json
{ "success": true, "data": {} }
```

or:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid request" } }
```

## Authentication

Production uses **Supabase Auth** (`AUTH_PROVIDER=supabase`). The operator signs in via Supabase; the web client sends the access token as `Authorization: Bearer <token>`. Self-service registration is disabled — admins provision accounts via `POST /admin/users`.

Set `AUTH_PROVIDER=legacy` only for local automated tests.

## Dondie Agent (Primary)

Survival agent endpoints:

- `GET /dondie` — returns the operator's Dondie agent or `null`
- `POST /dondie/activate` — requires `strategyId`; creates agent on FREE tier with wallet balance 0
- `POST /dondie/pause` — stops scheduled and manual runs
- `POST /dondie/resume` — re-enables runs
- `POST /dondie/run` — optional `symbol`, `timeframe`; executes brain → automation pipeline
- `GET /dondie/wallet` — wallet balance, tier, and immutable ledger (PnL credits + brain debits)
- `GET /dondie/memories` — recent run memories and evaluation scores
- `GET /dondie/chat` — short in-office talk thread with Dondie (last ~20 messages)
- `POST /dondie/chat` — body `{ "message": "..." }`; returns assistant reply, thread, and a short `speechBubble` for the Office sprite. Replies are grounded in live agent status/strategy/memories. Uses `DONDIE_LLM_API_KEY` when set; otherwise a deterministic template. Does **not** debit the survival wallet.
- `POST /dondie/universe` — body `{ "symbols": ["AAPL", ...] }` updates the agent's symbol universe

Survival loop behavior on `POST /dondie/run`:

- Selects brain from wallet tier (FREE / STANDARD / PRO); STANDARD/PRO require `DONDIE_LLM_API_KEY`
- Debits brain cost before LLM runs; falls back to FREE if funds are insufficient
- Credits ~`DONDIE_PNL_CREDIT_PERCENT` of realized trade PnL to the wallet
- On US equity weekends (Sat/Sun ET), ACTIVE runs take the **weekend paper BTC** path instead: paper-fills BTCUSD scalps and credits the wallet under `WEEKEND_CRYPTO_DESK` (capped daily; not a live crypto venue yet)
- Auto-upgrades/downgrades tier from wallet balance thresholds
- Records a memory + evaluation score and may expand the symbol universe

Survival config: `apps/api/src/dondie/dondie.config.ts` and `.env` (see `docs/dondie-survival-model.md`).

## Trading Runtime (Agent Infrastructure)

- `POST /automation/run` — signal → risk → order pipeline
- `POST /signals/generate` — AI signal for symbol/strategy
- `POST /orders` / `GET /orders` — order lifecycle
- `GET /trades` / `GET /positions` — fill and position state
- `GET /portfolios` — account equity and PnL

## Risk (Capital Preservation)

- `GET /risk` / `PUT /risk` — operator-configured limits
- All order routes pass through risk engine before broker execution

## Market Data

- `GET /market/prices/:symbol` — candles by timeframe
- `GET /market/quotes/:symbol` — latest quote
- `GET /market/indicators/:symbol` — indicator snapshot
- `GET /market/watchlists` / `PUT /market/watchlists`

## Strategies

- `POST /strategies` / `GET /strategies` / `PUT /strategies/:id` / `DELETE /strategies/:id`
- Dondie requires an linked strategy at activation

## Simulation Lab

- `POST /backtests/run` — replays a fixed SMA crossover strategy (fastPeriod/slowPeriod), independent of Dondie's actual signal logic
- `POST /backtests/run-signal` — replays `generateSignal` itself (the logic Dondie's free/standard/pro brains trade with, including gold-aware tuning and seasonality), bar-by-bar with no lookahead
- `POST /backtests/walk-forward`

## Broker

- `POST /brokers/connect` — Alpaca credentials (encrypted)
- `GET /brokers/accounts`

## Analytics & Reports

- `GET /analytics/performance` and related endpoints
- `GET /reports/performance/csv` / `/pdf`

## Admin

- `POST /admin/users` — provision operator accounts
- `GET /admin/health` / `GET /admin/metrics` / `GET /admin/audit`

## Realtime

Authenticated Socket.IO at `/ws` — market, signal, order, trade, notification events scoped to the operator session.

## Health

- `GET /health` — API and Supabase readiness

See `README.md` for environment setup and `docs/architecture.md` for request flow.
