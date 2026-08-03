-- Order reconciliation state + portfolio-level risk limits.
--
-- Orders previously stored only the status locally, so a working order could not be
-- matched back to the broker after a restart and fills were never reconciled. Risk rules
-- gain the portfolio-level ceilings the engine now enforces.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS broker_order_id text NULL,
  ADD COLUMN IF NOT EXISTS client_order_id text NULL,
  ADD COLUMN IF NOT EXISTS filled_quantity numeric(18, 6) NULL,
  ADD COLUMN IF NOT EXISTS filled_average_price numeric(18, 4) NULL,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz NULL;

-- One broker submission per client order id: a replayed submit cannot double-fill.
CREATE UNIQUE INDEX IF NOT EXISTS orders_user_client_order_id_key
  ON public.orders (user_id, client_order_id)
  WHERE client_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_broker_order_id_idx
  ON public.orders (broker_order_id)
  WHERE broker_order_id IS NOT NULL;

-- The duplicate-order guard and the reconciliation worker both scan working orders
-- for one user and symbol; without this they were full table scans.
CREATE INDEX IF NOT EXISTS orders_user_status_symbol_idx
  ON public.orders (user_id, status, symbol);

-- Realized P&L windows read closed trades by close time.
CREATE INDEX IF NOT EXISTS trades_user_closed_at_idx
  ON public.trades (user_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;

ALTER TABLE public.risk_rules
  ADD COLUMN IF NOT EXISTS max_concurrent_positions integer NULL,
  ADD COLUMN IF NOT EXISTS max_consecutive_losses integer NULL,
  ADD COLUMN IF NOT EXISTS max_weekly_loss numeric(8, 4) NULL;
