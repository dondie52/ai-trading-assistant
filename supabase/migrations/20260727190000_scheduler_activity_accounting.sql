-- Trade activity timeline + scheduler heartbeat (durable across API restarts).
-- Positions already enforce UNIQUE(user_id, symbol); keep that invariant.

CREATE TABLE IF NOT EXISTS public.trade_activities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  agent_id uuid NULL,
  scan_id uuid NULL,
  correlation_id uuid NOT NULL,
  stage text NOT NULL,
  trigger_type text NOT NULL,
  symbol text NULL,
  signal text NULL,
  confidence integer NULL,
  required_threshold integer NULL,
  decision text NULL,
  reason_code text NULL,
  reason text NULL,
  requested_notional numeric(18, 6) NULL,
  requested_quantity numeric(18, 6) NULL,
  broker_order_id text NULL,
  client_order_id text NULL,
  order_status text NULL,
  filled_quantity numeric(18, 6) NULL,
  filled_average_price numeric(18, 6) NULL,
  cash_before numeric(18, 6) NULL,
  cash_after numeric(18, 6) NULL,
  buying_power_before numeric(18, 6) NULL,
  buying_power_after numeric(18, 6) NULL,
  headline text NOT NULL,
  source text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  exchange_local_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS trade_activities_user_occurred_idx
  ON public.trade_activities (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS trade_activities_scan_idx
  ON public.trade_activities (scan_id);

CREATE TABLE IF NOT EXISTS public.scheduler_heartbeats (
  worker_id text PRIMARY KEY,
  status text NOT NULL,
  last_scheduled_scan_at timestamptz NULL,
  last_manual_scan_at timestamptz NULL,
  next_expected_scan_at timestamptz NULL,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  last_result text NULL,
  last_duration_ms integer NULL,
  last_symbols_evaluated integer NULL,
  last_signals_generated integer NULL,
  last_orders_submitted integer NULL,
  last_orders_filled integer NULL,
  last_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  trading_environment text NOT NULL DEFAULT 'PAPER',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scan_locks (
  lock_name text PRIMARY KEY,
  holder text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Ensure position uniqueness remains (idempotent if already present).
CREATE UNIQUE INDEX IF NOT EXISTS positions_user_id_symbol_key
  ON public.positions (user_id, symbol);

ALTER TABLE public.portfolios
  ADD COLUMN IF NOT EXISTS capital_deployed numeric(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_value numeric(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_basis numeric(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_pnl numeric(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS asset_id text NULL,
  ADD COLUMN IF NOT EXISTS cost_basis numeric(18, 4) NULL,
  ADD COLUMN IF NOT EXISTS market_value numeric(18, 4) NULL;

ALTER TABLE public.trade_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_locks ENABLE ROW LEVEL SECURITY;
