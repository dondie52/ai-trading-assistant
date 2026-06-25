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

Planned (survival loop):

- Wallet ledger endpoints
- Tier upgrade/downgrade events
- Brain cost debits on run completion
- PnL credits on trade close

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

- `POST /backtests/run`
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
