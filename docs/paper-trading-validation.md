# Paper Trading Validation Gate

Paper execution is implemented and automated, but a strategy is not approved for live capital until this operational program is completed.

## Duration And Regimes

- Minimum observation period: 30 consecutive days.
- Preferred observation period: 60 consecutive days.
- Required samples: bullish, bearish, sideways, high-volatility, and low-volatility conditions.
- Keep the broker mode set to paper and preserve all order, trade, signal, risk, notification, and audit records.

## Daily Checks

1. Confirm API, database, Redis, web, and AI-service health.
2. Review rejected and executed orders against their risk decisions.
3. Reconcile paper broker cash, positions, orders, and platform state.
4. Review signal confidence, model version, API/signal/trade latency, errors, queue depth, and alerts from `/api/v1/admin/metrics`.
5. Record equity, drawdown, win rate, profit factor, Sharpe ratio, and execution failures.

## Exit Criteria

- Zero risk-rule bypasses.
- Drawdown remains inside the approved strategy limit.
- Positive expectancy and stable execution over the full observation period.
- Signal performance is measured against and exceeds the documented baseline.
- Application metrics are collected and external alert routing, backup restore, and service recovery exercises pass.
- Security, risk, model, and leadership approvals are recorded.

## Evidence To Retain

- Dated performance exports and equity curves.
- Strategy and model versions.
- Audit-log export for signals, orders, risk decisions, and configuration changes.
- Broker reconciliation results.
- Incident, outage, and recovery-test reports.
- Admin metrics exports or screenshots covering latency, error rate, throughput, trade outcomes, model versions, and queue depth.
- Final approval record or rejection rationale.
