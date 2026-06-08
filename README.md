# AI Trading Platform MVP

Risk-first AI trading platform MVP built as a modular monolith:

- `apps/web`: Next.js, React, TypeScript, TailwindCSS
- `apps/api`: NestJS, TypeScript, Prisma schema, JWT auth, trading/risk/audit modules
- `apps/ai-service`: Python FastAPI signal service
- `packages/shared`: indicators, signal scoring, risk engine, analytics, auth validation
- `packages/types`: shared API/domain contracts
- `infrastructure`: Dockerfiles and compose services

## Prerequisites

- Node.js 22+
- npm 10+
- Docker Desktop for PostgreSQL, Redis, API, web, and AI service containers
- Python 3.12 only if running `apps/ai-service` outside Docker

## Environment

Copy `.env.example` to `.env` and set real values for local or deployed environments.

Required production values:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `MFA_ENCRYPTION_KEY`
- `BROKER_CREDENTIAL_ENCRYPTION_KEY`
- `NEXT_PUBLIC_API_URL`
- `AI_SERVICE_URL`

Optional broker values (required for live market data unless each user connects Alpaca in the app):

- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`
- `ALPACA_ENVIRONMENT` (`PAPER` or `LIVE`, default `PAPER`)
- `ALLOW_ALPACA_LIVE_TRADING=true` (required before routing orders to a live Alpaca account)

Optional API safety values:

- `SESSION_IDLE_TIMEOUT_MINUTES` (default `30`)
- `CORS_ORIGINS` (comma-separated browser origins; defaults to local web origins)
- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_MAX` (default `600`)
- `RATE_LIMIT_DISABLED=true` for controlled local test environments only

Do not commit real secrets. Empty JWT secrets are replaced by per-process random values for local development only.
Docker Compose requires `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_KEY`, and `BROKER_CREDENTIAL_ENCRYPTION_KEY` to be set in `.env`; it does not provide default secret values. Authentication, MFA, and broker-credential encryption keys must each be at least 32 characters.

Password reset tokens are stored only as hashes. In production, `POST /api/v1/auth/password-reset/request` returns a generic response and expects an email delivery integration to send the raw token. For local automated tests only, `EXPOSE_PASSWORD_RESET_TOKEN_FOR_TESTS=true` exposes the raw token in the response.

## Install

```bash
npm install
```

## Database

The Prisma schema is in `apps/api/prisma/schema.prisma`.

```bash
docker compose up -d postgres redis
npm run prisma:migrate
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=<set-locally> npm run seed
```

Docker Compose runs `prisma migrate deploy` for the API container before the NestJS server starts.
The seed command creates or refreshes the admin user and ensures it has a default paper portfolio, risk rules, paper broker account, and watchlist.

The default no-env API runtime uses an in-memory store for deterministic MVP validation. When `DATABASE_URL` is configured, the API hydrates users, sessions, portfolios, strategies, signals, orders, trades, positions, risk rules, broker accounts, watchlists, notifications, market prices, and audit logs from PostgreSQL and persists state changes through Prisma.

When `REDIS_URL` is configured, notifications are pushed to `queue:notifications` and market candles are cached under `cache:market:<SYMBOL>:<timeframe>:candles`. `/api/v1/health` probes PostgreSQL through Prisma and Redis with `PING`.

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`. The API runs at `http://localhost:3001/api/v1`.

Run the full container stack:

```bash
docker compose up --build
```

Container healthchecks are defined for the AI service, API, and web app. The API exposes `GET /api/v1/health`, which reports PostgreSQL/Prisma and Redis readiness when `DATABASE_URL` and `REDIS_URL` are configured.
Every service uses Compose's `unless-stopped` restart policy. Backup, restore, alerting, and recovery procedures are documented in `docs/operations.md`.
`npm run test` also includes a static infrastructure check that verifies the Compose services, healthchecks, required secret interpolation, migration command, Dockerfiles, and CI validation steps. This does not replace a real container runtime startup check.

## Tests

```bash
npm run lint
npm run test
npm run test:e2e
npm run build
npm run validate
```

`npm run validate` runs lint, unit/integration tests, Playwright E2E, and production builds.
The Vitest stage enforces at least 80% statements, functions, and lines plus 60% branch coverage.

The authenticated web terminal is organized into responsive Overview, Market, Strategies, Risk & Alerts, Simulation Lab, and Admin views. Market tables remain horizontally scrollable inside their panel on narrow screens without causing page-level overflow.

Market data endpoints support `1m`, `5m`, `15m`, `1h`, `4h`, and `1d` timeframes. Indicator snapshots include SMA, EMA, RSI, MACD, Bollinger Bands, ATR, and volume metrics.
The market console receives authenticated Socket.IO updates from `/ws` every five seconds and falls back to HTTP polling if the socket is unavailable. Real-time events are scoped to the active user and session.

`POST /api/v1/backtests/run` replays historical candles with fees and slippage. `POST /api/v1/backtests/walk-forward` selects parameters on training windows and reports only out-of-sample test windows. `GET /api/v1/reports/performance/csv` and `/pdf` export win rate, profit factor, Sharpe, Sortino, maximum drawdown, return, average trade, risk/reward, and the equity curve while writing audit records.

Collection endpoints use `{ data, page, pageSize, total }` pagination inside the standard success envelope. `pageSize` defaults to 20 and is capped at 100.

Paper MARKET orders fill from the server's current simulated quote, never a caller-provided fill price. LIMIT and STOP orders remain submitted until a quote makes them marketable. Quote updates mark positions and portfolio equity to market.

Playwright E2E covers:

1. User registration
2. Login
3. Dashboard loads
4. Strategy creation
5. Manual, semi-automated, and fully automated paper trades
6. Signal generation
7. Risk rule blocks invalid trade
8. Portfolio/trade history updates
9. Watchlist updates and historical market data
10. Strategy edits and activation controls
11. Risk configuration persistence
12. TOTP MFA setup and login challenge
13. Backtest completion and system health visibility
14. Walk-forward out-of-sample backtesting
15. Authenticated WebSocket updates
16. Admin user management, operational metrics, and audit log visibility

The workflow runs in desktop Chromium and a Pixel 7 mobile Chromium profile. Playwright starts the API with `ENABLE_E2E_SEED=true`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD`. During API startup, the admin test user is seeded after Prisma hydration; when `DATABASE_URL` is configured, the user and its default paper portfolio, risk rules, paper broker account, and watchlist are persisted through Prisma before tests run.

CI installs browsers with:

```bash
npx playwright install --with-deps
```

## Safety Guarantees

- All trading routes pass through the risk engine before broker execution.
- API routes are protected by a user/IP scoped rate-limit guard with env-configurable thresholds.
- Protected API routes verify the backing session is active, unexpired, and not revoked, even when the access token is otherwise valid.
- Inactive HTTP and WebSocket sessions expire after the configured idle timeout.
- Refresh tokens rotate after every successful use and the prior token is immediately invalidated.
- TOTP MFA setup secrets are encrypted with AES-256-GCM, and MFA-enabled accounts receive no session until a valid authenticator code is verified.
- Password resets store only hashed reset tokens, audit request/confirmation events without token metadata, and revoke active sessions after confirmation.
- User profiles persist notification preferences for trade, signal, risk, and system alerts; disabled alert classes are not enqueued.
- Rejected trades are stored as rejected orders and produce risk audit events.
- Orders retain append-only status history for pending, submission, fill, rejection, and cancellation transitions.
- Successful trading actions create immutable audit logs.
- PostgreSQL rejects `UPDATE` and `DELETE` operations against `audit_logs` through an append-only trigger.
- Broker access is isolated behind `BrokerAdapter`; paper broker is the default.
- Alpaca credentials are validated against Alpaca before storage and encrypted with AES-256-GCM; public responses expose only whether credentials exist.
- Audit metadata redacts password, token, secret, credential, authorization, and API key fields.
- RBAC protects `/api/v1/admin/*`; user-facing services enforce resource ownership.

See `docs/requirements-traceability.md` for requirement-to-test evidence and
`docs/paper-trading-validation.md` for the mandatory 30/60-day live-capital approval gate.
