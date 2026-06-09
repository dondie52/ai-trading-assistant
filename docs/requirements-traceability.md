# MVP Requirements Traceability

This matrix maps the requested MVP to implementation and automated evidence. "Implemented" means the software path exists; production approval still requires the operational gates in `paper-trading-validation.md`.

## Product Scope

| Requirement | Status | Primary implementation | Automated evidence |
| --- | --- | --- | --- |
| Authentication, refresh, expiry, MFA | Implemented | Nest auth controllers, persisted idle activity, rotating JWT refresh tokens, encrypted TOTP MFA, HTTP/WebSocket session expiry | `auth.test.ts`, `mfa.service.spec.ts`, `platform.integration.spec.ts`, Playwright MFA flow |
| Trader dashboard | Implemented | Next.js Overview with portfolio, balances, positions, history, and metrics | Playwright desktop/mobile dashboard |
| Market data, watchlists, indicators | Implemented | Timeframe-aware candles, paper quotes, SMA, EMA, RSI, MACD, Bollinger Bands, ATR, volume | `indicators.test.ts`, market integration test, Playwright Market flow |
| AI BUY/SELL/HOLD signals | Implemented | FastAPI service with Nest client and deterministic local fallback; confidence and model metadata retained | `signal.test.ts`, signal/trading integration test, Playwright signal flow |
| Strategy management | Implemented | CRUD, activation state, and parameter JSON | Integration and Playwright strategy flows |
| Manual, semi-auto, auto trading | Implemented | Manual ticket, approved-signal execution, and automated signal-to-order runner | Integration tests and Playwright workflow |
| Paper trading | Implemented | Default paper broker, server-quoted MARKET fills, risk-revalidated pending LIMIT/STOP triggers, mark-to-market virtual portfolio | Broker integration and Playwright workflow |
| Mandatory risk engine | Implemented | Shared risk validator is called before initial and pending-fill broker submissions using current state; 2% compliance ceiling | `risk.test.ts`, initial and execution-time risk rejection broker-spy integration tests |
| Broker abstraction | Implemented | `BrokerAdapter`, paper adapter, Alpaca remote credential validation, encrypted credential persistence | Broker unit/integration and persistence tests |
| Lifecycle tracking | Implemented | Orders, append-only status events, trades, positions, cancellation | Persistence and trading integration tests |
| Analytics | Implemented | Win rate, profit factor, Sharpe, Sortino, drawdown, return, average trade, risk/reward, equity curve, realized/unrealized PnL | `analytics.test.ts`, position and mark-to-market integration tests |
| Backtesting | Implemented | Historical replay and walk-forward parameter selection with out-of-sample windows, fees, and slippage | `backtest.test.ts`, integration and Playwright Simulation Lab |
| Admin dashboard | Implemented | Users, suspend/reactivate, system health, runtime metrics, audit log search | Metrics/admin integration tests and Playwright Admin flow |
| Notifications | Implemented | Trade, signal, risk, system preferences and Supabase notification queue | Notification preference and Supabase persistence tests |
| Immutable audit logging | Implemented | Redacted frozen records plus PostgreSQL update/delete rejection trigger | Audit store and infrastructure migration tests |
| `/api/v1` routes | Implemented | Versioned Nest controllers | `docs/api.md`, integration and E2E traffic |
| Pagination standard | Implemented | Collection routes return data/page/pageSize/total with validated limits | `pagination.spec.ts`, web collection client |
| Real-time updates | Implemented | Authenticated `/ws` Socket.IO gateway with user rooms and polling fallback | Event-bus unit test and Playwright WebSocket assertion |
| Operational monitoring | Implemented in application | API/signal/trade latency, error rate, throughput, model versions, trade outcomes, Supabase queue depth | `operational-metrics.service.spec.ts`, Supabase boundary tests, Admin UI |
| Full Docker Compose stack | Defined and statically validated | API, web, and AI service with Supabase persistence | `tests/infrastructure/stack.spec.ts` |
| GitHub Actions CI | Implemented | Install, Playwright browser install, and `npm run validate` | Infrastructure CI test |

## Security Controls

| Control | Evidence |
| --- | --- |
| No committed runtime secrets | Required Compose interpolation, `.env.example`, production fail-closed key validation |
| RBAC and ownership | JWT/session guards, role guard, owner-scoped service lookups, admin integration tests |
| Input validation | Shared body readers, enum/number/range checks, password validation tests |
| No sensitive logging | Audit metadata redaction test and generic production password-reset response |
| Trading cannot bypass risk | Broker call occurs only after approval; rejection test asserts zero broker calls |
| Every trading action audited | Signal, approval/rejection, submission, fill, cancellation, and automation audit paths |
| Session security | Server-side expiry/revocation, password-reset revocation, refresh rotation and replay rejection |
| Broker secret security | Remote validation, AES-256-GCM at rest, production fail-closed key requirement, redacted public/audit views |
| Browser origin policy | Environment-configured HTTP and WebSocket CORS allowlist |

## Test Coverage

- Unit: auth validation, MFA, indicators, signal scoring, position sizing/risk, analytics, historical/walk-forward backtesting, pagination, and operational metrics.
- Integration: auth/portfolio, signal-to-trade, trade-to-risk, broker abstraction/credentials, Supabase persistence, admin, reports, health, mark-to-market, and pending-order triggers.
- E2E: registration, login, dashboard, strategies, manual/semi/auto paper trades, blocked risk, portfolio/history, watchlist, historical/walk-forward backtests, WebSocket updates, MFA, risk preferences, metrics, and admin audit visibility.
- Infrastructure: Compose topology, health checks, secret interpolation, migrations, Dockerfiles, and CI commands.
- Coverage gate: statements/lines/functions at least 80%; branches at least 60%.

## Operational Gates

The following require an environment or elapsed operational evidence and are not implied by a passing source test:

1. Run `docker compose up --build` on a host with Docker and verify all service health checks.
2. Complete the 30-day minimum paper-trading campaign across required market regimes.
3. Run load, backup restore, disaster recovery, external alert-routing, and security-review exercises using `operations.md`.
4. Approve a real Alpaca integration before any live-capital use; paper mode remains the default.
