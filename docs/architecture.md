# MVP Architecture

The MVP follows the planning documents' modular monolith approach.

Request flow:

1. Next.js web client calls `/api/v1`.
2. NestJS guards validate JWT access tokens, active server-side sessions, and RBAC.
3. A user/IP scoped rate-limit guard enforces configurable API request ceilings.
4. Controllers delegate to `PlatformService`.
5. Trading actions call the shared risk engine.
6. Manual and semi-automated orders execute only after risk validation.
7. Fully automated runs call `/api/v1/automation/run`, generate a signal, enforce confidence/strategy rules, calculate position size, and submit through the same risk-checked order path.
8. Approved paper orders execute through `PaperBrokerAdapter`; MARKET fills use server quotes while LIMIT and STOP orders wait for marketable quote updates. Pending orders are risk-validated again using current state before the broker is called.
9. Signals can call FastAPI via `AI_SERVICE_URL`; the API falls back to the shared deterministic model if unavailable.
10. Every auth, signal, strategy, broker, automation, risk, and trade action writes an immutable audit record.
11. When `DATABASE_URL` is configured, the API hydrates platform state from PostgreSQL at startup and persists state-changing operations through Prisma.
12. When `REDIS_URL` is configured, notifications are pushed to a Redis-backed queue and market candles are cached with a short TTL.
13. Authenticated Socket.IO connections at `/ws` receive user-scoped market, signal, order, trade, and notification events.
14. A global interceptor and domain timers collect API, signal, and trade latency, failures, throughput, model versions, and queue depth for the admin metrics endpoint.

Core modules:

- Auth/session/token service
- Password reset token hashing and session revocation
- Market data, multiple timeframes, and indicators
- AI signals and model metadata
- Strategy management
- Fully automated bot runner
- Historical and walk-forward out-of-sample backtesting with fees, slippage, and performance metrics
- Trading/order/position lifecycle
- Risk rules and position sizing
- Paper broker abstraction
- Portfolio and analytics
- Notifications
- Admin health, operational metrics, audit, and users

Persistence:

- `apps/api/prisma/schema.prisma` models PostgreSQL entities.
- Local validation uses an in-memory store so tests do not require external services.
- Configured runtimes write users, sessions, password reset tokens, broker accounts, portfolios, strategies, signals, orders, trades, positions, risk rules, notifications, watchlists, market prices, and audit logs through Prisma.
- The startup hydrator merges persisted PostgreSQL state back into the in-memory domain store before requests are served.
- E2E seed users are created during API startup after hydration; configured PostgreSQL runtimes persist those users and their default paper account state through the same Prisma bootstrap path.
- Redis stores `queue:notifications` events for async delivery workers and `cache:market:<SYMBOL>:<timeframe>:candles` entries for market data caching.
- Alpaca credentials are validated remotely and stored as AES-256-GCM ciphertext; decrypted values remain inside the broker boundary.
- Session activity is persisted and checked by HTTP and WebSocket authentication paths.
- Docker Compose provisions PostgreSQL and Redis for local persistence migration work.
- `GET /api/v1/health` reports whether PostgreSQL and Redis are configured and reachable.
- `GET /api/v1/admin/metrics` reports runtime latency, error, throughput, execution, and queue metrics.
