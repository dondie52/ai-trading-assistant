/** Explicit skip / decision reason codes for the trade activity timeline. */
export type TradeSkipReasonCode =
  | "INSUFFICIENT_BUYING_POWER"
  | "TIER_RESTRICTED"
  | "ASSET_CLASS_DISABLED"
  | "POSITION_ALREADY_OPEN"
  | "ORDER_ALREADY_PENDING"
  | "MAX_POSITIONS_REACHED"
  | "CONFIDENCE_TOO_LOW"
  | "MARKET_CLOSED"
  | "MIN_NOTIONAL_NOT_MET"
  | "COOLDOWN_ACTIVE"
  | "NET_EDGE_TOO_LOW"
  | "SYMBOL_NOT_TRADABLE"
  | "FRACTIONAL_NOT_SUPPORTED"
  | "RISK_LIMIT"
  | "DATA_STALE"
  | "BROKER_REJECTED"
  | "SCHEDULER_LOCKED"
  | "SIGNAL_HOLD"
  | "EMERGENCY_STOP"
  | "MANUAL_MODE"
  | "NO_OPEN_POSITION"
  | "MISSING_MARKET_PRICE"
  | "MAX_TRADES_PER_DAY"
  | "UNIVERSE_UNAVAILABLE"
  | "UNKNOWN";

export type ScanTriggerType =
  | "SCHEDULED"
  | "MANUAL_FORCE_SCAN"
  | "STARTUP"
  | "RETRY"
  | "API_REQUEST";

export type TradeActivityStage =
  | "SCAN_STARTED"
  | "SYMBOL_EVALUATED"
  | "SIGNAL_GENERATED"
  | "SIGNAL_SKIPPED"
  | "ORDER_INTENT_CREATED"
  | "ORDER_SUBMITTING"
  | "ORDER_SUBMITTED"
  | "ORDER_ACCEPTED"
  | "ORDER_PARTIALLY_FILLED"
  | "ORDER_FILLED"
  | "ORDER_REJECTED"
  | "ORDER_CANCELED"
  | "POSITION_OPENED"
  | "POSITION_UPDATED"
  | "EXIT_SIGNAL_GENERATED"
  | "CLOSE_ORDER_SUBMITTED"
  | "POSITION_CLOSED"
  | "RECONCILIATION_COMPLETED"
  | "ERROR";

export type SchedulerStatus = "RUNNING" | "DELAYED" | "STOPPED";

const SKIP_PATTERNS: readonly { readonly code: TradeSkipReasonCode; readonly pattern: RegExp }[] = [
  { code: "INSUFFICIENT_BUYING_POWER", pattern: /insufficient|buying power|available cash|cash balance|too low|no cash|stake cash is \$0/i },
  { code: "MIN_NOTIONAL_NOT_MET", pattern: /notional|position size was zero|micro stakes|missing quantity|below minimum/i },
  { code: "POSITION_ALREADY_OPEN", pattern: /duplicate position|already long/i },
  { code: "ORDER_ALREADY_PENDING", pattern: /already pending|order already/i },
  { code: "MAX_POSITIONS_REACHED", pattern: /max positions|maximum positions/i },
  { code: "MAX_TRADES_PER_DAY", pattern: /max trades per day/i },
  { code: "CONFIDENCE_TOO_LOW", pattern: /below threshold|confidence .* below|minimum confidence/i },
  { code: "MARKET_CLOSED", pattern: /market closed|cash session/i },
  { code: "COOLDOWN_ACTIVE", pattern: /cooldown active/i },
  { code: "NET_EDGE_TOO_LOW", pattern: /net edge/i },
  { code: "SIGNAL_HOLD", pattern: /signal was hold|sees hold/i },
  { code: "EMERGENCY_STOP", pattern: /emergency stop/i },
  { code: "MANUAL_MODE", pattern: /automation mode is manual|manual — orders/i },
  { code: "NO_OPEN_POSITION", pattern: /no open long position/i },
  { code: "MISSING_MARKET_PRICE", pattern: /missing market price/i },
  { code: "TIER_RESTRICTED", pattern: /tier|brain .*locked|wallet.*too low for/i },
  { code: "ASSET_CLASS_DISABLED", pattern: /asset class|crypto restriction|not enabled/i },
  { code: "SYMBOL_NOT_TRADABLE", pattern: /not tradable|cannot trade/i },
  { code: "FRACTIONAL_NOT_SUPPORTED", pattern: /fractional/i },
  { code: "RISK_LIMIT", pattern: /risk|daily loss|drawdown|trading stopped/i },
  { code: "DATA_STALE", pattern: /stale|unavailable market data/i },
  { code: "BROKER_REJECTED", pattern: /broker rejected|alpaca.*reject|order rejected/i },
  { code: "SCHEDULER_LOCKED", pattern: /scheduler locked|scan already/i },
  { code: "UNIVERSE_UNAVAILABLE", pattern: /universe scan|no usable market data|no actionable/i }
];

export const classifySkipReason = (reason: string | undefined | null): TradeSkipReasonCode => {
  if (!reason || !reason.trim()) {
    return "UNKNOWN";
  }
  for (const entry of SKIP_PATTERNS) {
    if (entry.pattern.test(reason)) {
      return entry.code;
    }
  }
  return "UNKNOWN";
};

export const formatActivityHeadline = (input: {
  readonly stage: TradeActivityStage;
  readonly symbol?: string;
  readonly signal?: string;
  readonly confidence?: number;
  readonly reasonCode?: TradeSkipReasonCode;
  readonly reason?: string;
  readonly filledQuantity?: number;
  readonly filledAveragePrice?: number;
  readonly triggerType?: ScanTriggerType;
}): string => {
  const symbol = input.symbol ?? "";
  switch (input.stage) {
    case "SCAN_STARTED":
      return `${input.triggerType === "MANUAL_FORCE_SCAN" ? "Manual" : "Scheduled"} scan started`;
    case "SIGNAL_GENERATED":
      return `${symbol} ${input.signal ?? "SIGNAL"}${
        typeof input.confidence === "number" ? ` — ${input.confidence}%` : ""
      }`;
    case "SIGNAL_SKIPPED":
      return `Skipped: ${input.reasonCode ?? classifySkipReason(input.reason)}${
        input.reason ? ` — ${input.reason}` : ""
      }`;
    case "ORDER_SUBMITTED":
      return `Order submitted${symbol ? ` for ${symbol}` : ""}`;
    case "ORDER_ACCEPTED":
      return `Order accepted${symbol ? ` for ${symbol}` : ""}`;
    case "ORDER_FILLED":
      return `Filled ${input.filledQuantity ?? ""} ${symbol} at $${(input.filledAveragePrice ?? 0).toFixed(2)}`.trim();
    case "ORDER_REJECTED":
      return `Order rejected: ${input.reasonCode ?? "BROKER_REJECTED"}`;
    case "POSITION_OPENED":
      return `Position opened ${symbol}`;
    case "POSITION_CLOSED":
      return `Position closed ${symbol}`;
    case "RECONCILIATION_COMPLETED":
      return "Reconciliation completed";
    case "ERROR":
      return `Error: ${input.reason ?? "unknown"}`;
    default:
      return input.reason ?? input.stage;
  }
};
