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
DONDIE_LLM_API_URL=https://api.openai.com/v1
DONDIE_LLM_API_KEY=
DONDIE_LLM_STANDARD_MODEL=gpt-4o-mini
DONDIE_LLM_PRO_MODEL=gpt-4o
```

---

## Implementation Status

| Capability | Status |
|------------|--------|
| FREE brain + scheduled runs | Implemented (Phase 1) |
| Wallet PnL credits | Designed, not wired |
| Brain cost debits | Designed, not wired |
| STANDARD / PRO LLM brains | Designed, not wired |
| Wallet ledger persistence | Designed, not wired |
| Tier auto-upgrade/downgrade | Designed, not wired |

See `docs/architecture.md` and `docs/api.md` for technical integration details.
