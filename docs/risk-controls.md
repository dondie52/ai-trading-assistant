# Risk Controls

The risk engine is implemented in `packages/shared/src/risk.ts`. `PlatformService.createOrder` calls it before initial broker submission, and pending LIMIT/STOP orders are evaluated again against current portfolio, position, drawdown, cash, and risk-rule state immediately before a marketable fill. The broker adapter is not called when execution-time validation fails.

Controls:

- Stop-loss is required.
- Take-profit is required.
- Buy stop-loss must be below entry price.
- Sell stop-loss must be above entry price.
- Risk amount cannot exceed max risk per trade.
- Position value cannot exceed max position size.
- Daily loss limit blocks trading.
- Max drawdown blocks trading.
- Stop-trading flag blocks trading.
- Buy orders require sufficient paper cash.

Rejected orders:

- Are stored with `REJECTED` status.
- Do not call the broker adapter.
- Create `RISK_REJECTED_ORDER` audit records.
- Create risk notifications.

Pending orders rejected at execution:

- Transition from `SUBMITTED` to `REJECTED`.
- Store the new risk decision and current market price.
- Do not submit the marketable order to the broker.
- Create `RISK_REJECTED_PENDING_ORDER` audit records and risk notifications.

Approved orders:

- Create `RISK_APPROVED_ORDER`.
- Execute through Alpaca when connected, otherwise `PaperBrokerAdapter`.
- Create `TRADE_EXECUTED`.
- Update portfolio, positions, orders, trades, notifications, and analytics inputs.
