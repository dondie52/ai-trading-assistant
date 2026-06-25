# Dondie — Autonomous Survival Agent

## Project Vision Document

Version: 2.0

---

# Executive Summary

**Dondie** is an autonomous trading agent that must **trade to pay for its own existence**. It analyzes markets, executes trades, earns wallet balance from performance, and spends that balance on progressively smarter "brains" (decision engines).

This repository is **not** a retail trading app for everyone. It is the **operator infrastructure** for running one survival agent:

* Market data and broker execution (hands)
* Risk engine (safety rails)
* Paper trading validation (proving ground)
* Operator console (control room)
* Dondie agent (the product)

The long-term objective is a self-sustaining agent that can operate across brokers and asset classes while staying inside strict risk controls — earning enough from trading to fund its own compute and cognition.

---

# Vision Statement

Build an autonomous agent that survives by trading: profitable runs fund smarter decisions; losses degrade capability until the operator intervenes or the agent recovers.

---

# Mission Statement

Create a secure, transparent, risk-bounded environment where Dondie can trade autonomously, pay for its own brain upgrades, and prove viability in paper mode before live capital is deployed.

---

# Problem Statement

Autonomous agents fail when they:

* Cannot fund their own operating costs
* Have no hard risk boundaries
* Operate without auditability or operator oversight
* Jump to live capital without validated track records

Dondie solves this with a **survival wallet**, **tiered cognition**, and a **risk-first execution stack** wrapped in an operator console.

---

# Target User

## Primary: Operator (You)

The single human who:

* Provisions the environment and broker credentials
* Sets risk limits and capital boundaries
* Links Dondie to a trading strategy
* Monitors wallet balance, tier, runs, and PnL
* Decides when paper performance justifies live trading

There is no mass-market end user. Access is admin-provisioned and secured (MFA, audit logs).

---

# Core Objectives

## Objective 1

Dondie trades autonomously on a schedule and on demand.

## Objective 2

Trading profits credit Dondie's wallet; brain usage debits it.

## Objective 3

Wallet balance controls tier access (FREE → STANDARD → PRO brains).

## Objective 4

Every trade passes through the risk engine — no bypasses.

## Objective 5

Paper trading validates performance before live capital.

## Objective 6

Full audit trail of agent runs, orders, wallet changes, and risk blocks.

---

# Product Goals

### Short-Term Goals

* Dondie Phase 1: FREE brain, activate/pause/run, scheduler
* Wallet ledger: PnL credits and brain debits
* Tier gating from wallet balance
* Operator console focused on agent status

### Mid-Term Goals

* STANDARD and PRO LLM brains
* Agent memory across runs
* Live Alpaca execution after paper validation gate

### Long-Term Goals

* Multi-broker agent portability
* Cross-asset survival (forex, crypto)
* Self-tuning strategy parameters within risk bounds

---

# Success Metrics

## Agent Survival Metrics

* Wallet balance trend (growing vs. depleting)
* Tier stability (time at STANDARD/PRO vs. FREE)
* Run frequency and brain cost efficiency
* Net PnL after brain costs

## Technical Metrics

* System uptime > 99.9%
* Trade execution latency < 1 second
* Risk engine block rate (should be low in steady state)

## Trading Metrics

* Risk-adjusted returns in paper mode
* Maximum drawdown within operator limits
* Win rate and profit factor over validation window

---

# Core Principles

## Survival First

The agent must earn before it can think expensively.

## Risk Engine Authority

Capital preservation overrides agent ambition.

## Transparency

Every run, wallet change, and trade is auditable.

## Operator Control

Pause, resume, and intervene at any time.

## Paper Before Live

No live capital until validation criteria are met.

---

# Product Scope

Included:

* Dondie autonomous agent (wallet, tiers, brains, scheduler)
* Trading execution (paper + Alpaca live)
* Risk controls
* Market data and signals
* Operator console
* Paper trading validation gate

Excluded (Initial MVP):

* Multi-tenant SaaS / self-service signup
* Strategy marketplace
* Social or copy trading
* High-frequency trading
* Options / futures / margin lending

---

# Future Vision

Dondie evolves into a fully self-funding agent: trading profits cover brain costs, infrastructure, and eventually expansion to new markets — always within operator-defined risk limits and with full auditability.

See `docs/dondie-survival-model.md` for the canonical survival economics definition.
