# API Summary

All routes are versioned under `/api/v1` and return:

```json
{ "success": true, "data": {} }
```

or:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid request" } }
```

## Authentication

Production uses **Supabase Auth** (`AUTH_PROVIDER=supabase`). The web client signs in with Supabase and sends the Supabase access token as `Authorization: Bearer <token>` to the API. Self-service registration is disabled; admins provision users via `POST /admin/users`.

Set `AUTH_PROVIDER=legacy` only for local automated tests.

Implemented route groups:

- `POST /auth/register` (disabled when `AUTH_PROVIDER=supabase`)
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/mfa/setup`
- `POST /auth/mfa/enable`
- `POST /auth/mfa/disable`
- `GET /users/me`
- `GET /users/profile`
- `PUT /users/profile` updates name fields and `notificationPreferences` (`trade`, `signal`, `risk`, `system`)
- `DELETE /users/account`
- `GET /portfolios`
- `GET /portfolios/:id`
- `GET /portfolios/:id/performance`
- `POST /brokers/connect`
- `GET /brokers/accounts`
- `DELETE /brokers/:id`
- `GET /market/prices/:symbol?timeframe=1m|5m|15m|1h|4h|1d`
- `GET /market/quotes/:symbol?timeframe=1m|5m|15m|1h|4h|1d`
- `GET /market/indicators/:symbol?timeframe=1m|5m|15m|1h|4h|1d`
- `GET /market/watchlists`
- `PUT /market/watchlists`
- `POST /backtests/run`
- `POST /backtests/walk-forward`
- `POST /strategies`
- `GET /strategies`
- `GET /strategies/:id`
- `PUT /strategies/:id`
- `DELETE /strategies/:id`
- `GET /signals`
- `GET /signals/:id`
- `GET /signals/history`
- `POST /signals/generate`
- `POST /automation/run`
- `GET /dondie` returns the authenticated user's Dondie agent or `null`
- `POST /dondie/activate` requires `strategyId`; creates the agent on the `FREE` tier
- `POST /dondie/pause`
- `POST /dondie/resume`
- `POST /dondie/run` optional `symbol` and `timeframe`; runs the tier-appropriate brain (free, standard LLM, or pro LLM) and automation pipeline
- `GET /dondie/wallet` returns wallet balance, tier, and ledger entries
- `POST /orders`
- `GET /orders`
- `GET /orders/:id`
- `GET /orders/:id/history`
- `DELETE /orders/:id`
- `GET /trades`
- `GET /trades/:id`
- `GET /trades/history`
- `GET /positions`
- `GET /positions/:symbol`
- `GET /risk`
- `PUT /risk`
- `GET /analytics/performance`
- `GET /analytics/drawdown`
- `GET /analytics/sharpe`
- `GET /analytics/winrate`
- `GET /reports/performance/csv`
- `GET /reports/performance/pdf`
- `GET /notifications`
- `PUT /notifications/read`
- `POST /admin/users` (admin-only; creates Supabase Auth user with temporary password)
- `GET /admin/users`
- `PUT /admin/users/:id/status`
- `GET /admin/system-health`
- `GET /admin/metrics`
- `GET /admin/audit-logs`

Collection routes return pagination metadata inside the response data:

```json
{
  "success": true,
  "data": {
    "data": [],
    "page": 1,
    "pageSize": 20,
    "total": 0
  }
}
```

`page` and `pageSize` must be positive integers, and `pageSize` is capped at 100.

The Socket.IO endpoint is `/ws`. Clients authenticate with `auth.token` containing an access token backed by an active server-side session, then subscribe with `market:subscribe`. Server events arrive as `realtime:event` with these types:

- `market.price`
- `signal.updated`
- `order.updated`
- `trade.executed`
- `notification.created`

Refresh tokens rotate on every successful `POST /auth/refresh`; replaying the previous token returns `INVALID_SESSION`. HTTP and WebSocket sessions expire after the configured idle period. MFA-enabled accounts must include a valid six-digit `mfaCode` in the login request before any access or refresh token is issued.

Order history contains append-only lifecycle events. Approved paper orders record `PENDING`, `SUBMITTED`, and their broker terminal state; risk and broker failures record `REJECTED`, and accepted cancellations record `CANCELLED`. MARKET fills use server quotes. LIMIT and STOP orders remain `SUBMITTED` until their trigger condition is met, then pass a fresh risk decision before broker submission. A stale approval that no longer satisfies current controls becomes `REJECTED`.

`POST /brokers/connect` accepts Alpaca credentials only for validation and encrypted persistence. Responses never return API keys or secret keys and expose `hasCredentials` instead.

`GET /admin/metrics` reports API latency/error rate, signal latency/throughput/model versions, trade latency/outcomes, and notification queue depth.
