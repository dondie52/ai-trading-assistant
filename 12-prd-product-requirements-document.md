# Product Requirements Document (PRD)

## Dondie — Autonomous Survival Agent

Version: 2.0

Status: Approved for Architecture & Development

---

# Executive Summary

**Dondie** is an autonomous trading agent that must earn its own operating capital. This repository provides the agent, its trading runtime, risk boundaries, and an operator console — not a consumer-facing trading product.

The platform enables:

* Autonomous agent runs on a schedule
* Wallet-funded tier progression (FREE → STANDARD → PRO brains)
* Risk-bounded trade execution (paper and live)
* Operator monitoring and intervention
* Paper validation before live capital

---

# Product Vision

An agent that survives by trading: profits fund smarter brains; losses force degradation until recovery or operator pause.

---

# Business Goals

Primary Goals:

1. Ship Dondie Phase 1 (FREE brain, scheduler, console).
2. Wire the survival wallet loop (PnL credits, brain debits, tier gating).
3. Validate paper trading performance over the mandatory gate period.
4. Enable live trading only after operator approval and env safety flags.

Secondary Goals:

1. STANDARD and PRO LLM brains.
2. Agent memory across runs.
3. Multi-broker portability.

There is **no SaaS subscription revenue model**. Dondie's "revenue" is trading PnL credited to its wallet.

---

# Problem Statement

Autonomous trading agents need:

* A way to pay for their own compute (brain costs)
* Hard risk limits they cannot override
* A proving ground before real capital
* Operator visibility and kill switches

---

# Target User

**Operator** — the human running Dondie. Admin-provisioned access only.

---

# Product Scope

Included in MVP:

* Dondie agent (activate, pause, run, wallet, tiers)
* Trading infrastructure (signals, orders, positions, broker)
* Risk engine
* Paper trading
* Operator console
* Audit and analytics

Excluded:

* Retail SaaS / self-service signup
* Strategy marketplace
* Consumer mobile apps
* Options / futures / HFT

---

# Core Modules

1. **Dondie Agent** — brain, wallet, scheduler, tier logic
2. **Trading Engine** — orders, fills, positions
3. **Risk Engine** — pre-trade validation
4. **Market Data** — prices, indicators, watchlists
5. **AI Signal Engine** — signal generation for FREE brain and strategies
6. **Paper Trading** — simulated execution
7. **Broker Adapter** — Alpaca paper/live
8. **Operator Console** — web dashboard
9. **Audit & Admin** — logs, health, user provisioning

---

# Operator Journey

Provision account
→ Login + MFA
→ Connect broker (paper default)
→ Create/link strategy
→ Configure risk limits
→ Activate Dondie
→ Monitor wallet, tier, runs, PnL
→ Validate paper performance (30/60-day gate)
→ Enable live trading (explicit approval)

---

# Key Features

## Dondie Agent Center

* Tier (FREE / STANDARD / PRO)
* Wallet balance and ledger
* Activate / pause / resume / manual run
* Last run reasoning and outcome
* Survival status (alive / degraded / starving)

## Trading Runtime

* Signal generation
* Automation pipeline (signal → risk → order)
* Paper and live broker execution

## Risk Matrix

* Position sizing, daily loss limits, drawdown caps
* Veto authority on every order

## Simulation Lab

* Backtests and walk-forward validation
* Strategy testing before agent activation

## Operator Analytics

* PnL, win rate, drawdown, Sharpe
* Exportable performance reports

---

# Success Metrics

Agent:

* Positive wallet trend over validation window
* Successful tier progression or stable FREE operation
* Acceptable drawdown within risk rules

Technical:

* Stable scheduler and API uptime
* Complete audit trail

Trading:

* Paper mode performance meets validation gate criteria

---

# MVP Release Criteria

Launch when:

1. Dondie runs autonomously in paper mode.
2. Wallet survival loop is wired and tested.
3. Risk controls enforce on every order.
4. Operator console shows agent-centric status.
5. Paper validation gate is documented.
6. Monitoring and audit are operational.

---

# Source of Truth

* `docs/dondie-survival-model.md` — survival economics
* `01-project-vision.md`
* `02-mvp-scope.md`
* `docs/architecture.md`
* `docs/api.md`

This document is the executive overview for the operator, developers, and AI coding agents.
