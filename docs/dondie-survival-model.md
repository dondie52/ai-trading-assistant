# Dondie Survival Model

Version: 1.0

Status: Canonical product definition

---

## What This Project Is

**Dondie** is an autonomous trading agent that must **earn its own operating capital through market activity**. It is not a consumer trading app and not a multi-tenant SaaS for retail traders.

The repository provides:

1. **Dondie** — the agent (decision brain, wallet, tier progression, scheduled runs)
2. **Trading infrastructure** — broker execution, market data, order lifecycle
3. **Risk engine** — hard safety rails so the agent cannot blow up capital
4. **Operator console** — a secure dashboard for the human operator to monitor, configure, and intervene

The human operator provisions access, connects broker credentials, sets risk limits, and watches Dondie work. The platform exists to give the agent a safe place to trade and survive.

---

## Survival Economics

Dondie operates on a wallet-funded tier system. Trading performance feeds the wallet; the wallet pays for cognition.

```text
FREE brain (no LLM cost)
    ↓ trades market
Profitable runs → wallet credits (PnL share)
    ↓ balance grows
STANDARD brain unlocked (≥ $25 wallet, $0.05/run)
    ↓ more capable decisions
PRO brain unlocked (≥ $100 wallet, $0.25/run)
    ↓ best cognition
Wallet depletes on losses or brain costs → tier downgrades or agent stalls
```

### Wallet credits

| Source | Default | Notes |
|--------|---------|-------|
| Trade PnL | 10% of realized profit credited to wallet | Configured via `DONDIE_PNL_CREDIT_PERCENT` |
| Weekend paper BTC | Share of paper BTCUSD scalp PnL (capped) | Sat/Sun only (US/Eastern); paper fills + daily wallet cap `$2.50`; ledger reason `WEEKEND_CRYPTO_DESK` |

### Brain costs (debits)

| Tier | Min wallet balance | Cost per run | Model |
|------|-------------------|--------------|-------|
| FREE | $0 | $0 | Deterministic signal reuse |
| STANDARD | $25 | $0.05 | `DONDIE_LLM_STANDARD_MODEL` (default gpt-4o-mini) |
| PRO | $100 | $0.25 | `DONDIE_LLM_PRO_MODEL` (default gpt-4o) |

### Survival outcomes

| State | Condition | Behavior |
|-------|-----------|----------|
| **Alive** | Wallet > 0, status ACTIVE | Agent runs on schedule, debits brain costs |
| **Degraded** | Wallet below tier threshold | Falls back to cheaper brain |
| **Starving** | Wallet = 0, only FREE available | Limited cognition, harder to recover |
| **Dead / paused** | Operator pause, risk halt, or sustained failure | No runs until intervention |

---

## Platform Layers

| Layer | Role |
|-------|------|
| Dondie agent | Autonomous decision-maker and wallet owner |
| Automation pipeline | Signal → risk check → order → fill |
| Risk engine | Veto power on every order |
| Paper broker | Proving ground before live capital |
| Live broker (Alpaca) | Real market execution when approved |
| Operator console | Monitoring, strategy link, manual override |

---

## MVP Success Criteria (Agent-Centric)

1. Dondie activates, runs on schedule, and executes paper trades through the risk engine.
2. Wallet ledger records credits from PnL and debits from brain usage.
3. Tier upgrades and downgrades follow wallet balance automatically.
4. Operator can pause, resume, and inspect every run via audit logs.
5. Paper trading validates strategy performance before live capital is enabled.
6. Live trading requires explicit operator approval and env safety flags.

---

## Configuration

Survival economics are controlled in `apps/api/src/dondie/dondie.config.ts` and `.env`:

```env
DONDIE_SCHEDULE_MINUTES=60
DONDIE_SCHEDULER_ENABLED=true
DONDIE_STANDARD_MIN_BALANCE=25
DONDIE_PRO_MIN_BALANCE=100
DONDIE_STANDARD_BRAIN_COST_USD=0.05
DONDIE_PRO_BRAIN_COST_USD=0.25
DONDIE_PNL_CREDIT_PERCENT=10
DONDIE_WEEKEND_EARN_ENABLED=true
DONDIE_WEEKEND_EARN_BASE_USD=0.35
DONDIE_WEEKEND_EARN_STANDARD_BONUS_USD=0.15
DONDIE_WEEKEND_EARN_PRO_BONUS_USD=0.35
DONDIE_WEEKEND_EARN_MAX_PER_DAY_USD=2.5
DONDIE_LLM_API_URL=https://api.openai.com/v1
DONDIE_LLM_API_KEY=
DONDIE_LLM_STANDARD_MODEL=gpt-4o-mini
DONDIE_LLM_PRO_MODEL=gpt-4o
```

### Micro-stake survival ($10 IRL)

Dondie is built to run on a real small stake, not a fake $100k paper fantasy:

* Equity ≤ $50 → **micro-stake mode**: fractional shares, up to ~85% of cash, ~20% risk room
* Qty displays show 4 decimals so `0.0036` SPY is not rendered as `0.00`
* Weekend paper BTC sizes to **your cash** (e.g. ~$8.50 notional on a $10 stake)

### Weekend survival (paper BTC desk)

US cash equities are closed Saturday and Sunday. Instead of idling, ACTIVE agents **paper-trade BTCUSD** on each schedule tick (and when the office loads if a run is due):

* Builds a BUY/SELL signal, paper-fills a cash-sized BTC scalp, records order/trade/PnL
* Credits the survival wallet under `WEEKEND_CRYPTO_DESK` from green scalps (hard daily cap)
* Win rate is intentionally modest (~52–58% by tier) — not a guaranteed binary bot
* Does **not** hit a live crypto venue yet (bridge until real crypto brokerage lands)
* Surfaces in the office as activity `SIDE_HUSTLE` with animated desks
* Disabled while NFP-only mode is on (`DONDIE_NFP_ONLY`, default `true`) — weekends never fall inside the NFP window

### NFP-only mode

By default (`DONDIE_NFP_ONLY=true`), Dondie only submits orders around the monthly US Non-Farm
Payrolls release — the first Friday of the month, 8:30am America/New_York:

* Scans still run on schedule; the brain still evaluates symbols and generates signals
* Execution is skipped outside the release window with reason code `OUTSIDE_NFP_WINDOW`
* The window width is configurable via `DONDIE_NFP_WINDOW_MINUTES_BEFORE` / `DONDIE_NFP_WINDOW_MINUTES_AFTER` (default `15` / `120`)
* Set `DONDIE_NFP_ONLY=false` to return to trading on every qualifying signal, any day

---

## Implementation Status

| Capability | Status |
|------------|--------|
| FREE brain + scheduled runs | Implemented |
| Wallet PnL credits | Implemented |
| Brain cost debits | Implemented |
| STANDARD / PRO LLM brains | Implemented (requires `DONDIE_LLM_API_KEY`) |
| Wallet ledger persistence | Implemented |
| Tier auto-upgrade/downgrade | Implemented |
| Run memory + symbol universe | Implemented |
| Weekend crypto desk earn | Implemented (wallet stipend; no live crypto broker yet) |
| NFP-only trading window | Implemented (`DONDIE_NFP_ONLY`, default on) |

See `docs/architecture.md` and `docs/api.md` for technical integration details.
