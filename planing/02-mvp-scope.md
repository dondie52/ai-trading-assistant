# MVP Scope Document

## Dondie Survival Agent Platform

Version: 2.0

---

# Purpose

This document defines the Minimum Viable Product for running **Dondie** — an autonomous agent that trades to fund its own cognition. The MVP delivers a secure operator environment where Dondie can run in paper mode, build a wallet, and prove survival economics before live capital.

---

# MVP Goals

- Prove Dondie can run autonomously on a schedule
- Validate the survival wallet loop (PnL credits, brain debits, tier gating)
- Establish risk-bounded execution through paper trading
- Give the operator full visibility and control
- Collect performance data for live-capital approval

---

# In-Scope Features

## Dondie Agent

- Activate / pause / resume agent
- Link agent to a trading strategy
- Scheduled and manual runs
- FREE brain (Phase 1)
- Wallet balance tracking
- Tier display (FREE / STANDARD / PRO)
- Wallet ledger (credits and debits)
- Tier auto-upgrade/downgrade from balance

## Operator Access

- Admin-provisioned login (Supabase Auth)
- MFA
- Session management and audit logging

## Trading Infrastructure (Agent Runtime)

- Broker connectivity (Alpaca paper + live with safety flags)
- Market data, indicators, watchlists
- AI signal generation (Python service + deterministic fallback)
- Manual, semi-auto, and full-auto execution paths
- Order lifecycle and position tracking

## Risk Management

- Stop-loss / take-profit configuration
- Daily loss limits
- Maximum position size
- Exposure controls
- Risk engine veto on every order

## Paper Trading

- Simulated account (default)
- Simulated fills from server quotes
- Performance tracking for validation gate

## Operator Console

- Dondie status (tier, wallet, last run, controls)
- Portfolio and PnL metrics
- Strategy management
- Risk configuration
- Simulation lab (backtests)
- Audit log visibility

## Analytics

- Win rate, profit factor, drawdown, Sharpe
- Equity curve and exportable reports

---

# Out of Scope

- Self-service user registration
- Multi-tenant consumer product
- Strategy marketplace
- Copy / social trading
- STANDARD/PRO LLM brains (post-MVP wiring)
- Reinforcement learning
- Options, futures, HFT
- Mobile apps

---

# User Roles

## Operator

- Monitor Dondie
- Configure strategy and risk
- Connect broker
- Pause/resume agent
- Approve live trading transition

## Administrator

- Provision operator accounts
- Monitor platform health
- Review audit logs

---

# Supported Asset Classes

Initial MVP: Stocks and ETFs

---

# Supported Brokers

Initial: Alpaca (Paper + Live with explicit approval)

---

# Non-Functional Requirements

## Security

- MFA, encrypted broker credentials, append-only audit logs

## Reliability

- 99.9% uptime target for agent scheduler and API

## Performance

- Agent run cycle completes within risk and broker latency bounds
- Console responsive for operator monitoring

---

# MVP Success Criteria

## Agent

- Dondie runs on schedule and executes paper trades
- Wallet reflects PnL credits and brain debits
- Tier changes follow wallet balance rules

## Technical

- End-to-end run → signal → risk → order → fill → wallet update
- Stable broker and market data integration

## Operator

- Full visibility into agent state and audit history
- Paper validation gate documented and enforceable

---

# Release Milestones

## Phase 1 (Current)

- Dondie FREE brain, scheduler, operator console shell

## Phase 2

- Wallet ledger, PnL credits, brain debits, tier gating

## Phase 3

- STANDARD / PRO LLM brains

## Phase 4

- Live capital after paper validation

---

# Exit Criteria

The MVP is complete when:

1. Dondie activates and runs autonomously in paper mode.
2. Wallet survival loop is operational (credit/debit/tier).
3. Risk controls block invalid trades.
4. Operator console shows agent status, wallet, and run history.
5. Paper trading validation gate is documented and testable.
6. Audit logs capture every agent action.

See `docs/dondie-survival-model.md` for survival economics.
