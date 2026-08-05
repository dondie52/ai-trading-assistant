import type {
  OrderSide,
  RiskDecision,
  RiskRejection,
  RiskRejectionCode,
  RiskRules
} from "@trading/types";

export interface TradeIntent {
  readonly symbol: string;
  readonly side: OrderSide;
  readonly price: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly requestedQuantity?: number;
}

export interface RiskContext {
  readonly equity: number;
  readonly cashBalance: number;
  readonly dailyRealizedPnl: number;
  readonly currentDrawdownPercent: number;
  readonly existingPositionValue: number;
  readonly existingPositionQuantity?: number;
  /** Rolling 7-day realized P&L. Negative values count against the weekly loss ceiling. */
  readonly weeklyRealizedPnl?: number;
  /** Open symbols right now, used for the concurrent-position cap. */
  readonly openPositionCount?: number;
  /** Losing trades since the last winner. */
  readonly consecutiveLosses?: number;
  /** Average entry of the existing position, used to detect averaging down. */
  readonly existingAveragePrice?: number;
}

/** Engine defaults applied when a rule is not configured on the account. */
export const DEFAULT_MAX_CONCURRENT_POSITIONS = 5;
export const DEFAULT_MAX_CONSECUTIVE_LOSSES = 4;
export const DEFAULT_MAX_WEEKLY_LOSS_PERCENT = 10;

const round = (value: number, precision = 6): number => Number(value.toFixed(precision));

type RiskRejectionExtras = {
  readonly currentValue?: number | undefined;
  readonly limit?: number | undefined;
  readonly suggestedQuantity?: number | undefined;
  readonly fixHint?: string | undefined;
};

type DefinedRiskRejectionExtras = {
  currentValue?: number;
  limit?: number;
  suggestedQuantity?: number;
  fixHint?: string;
};

const rejection = (
  code: RiskRejectionCode,
  title: string,
  message: string,
  extras: RiskRejectionExtras = {}
): RiskRejection => {
  const definedExtras: DefinedRiskRejectionExtras = {};
  if (extras.currentValue !== undefined) {
    definedExtras.currentValue = extras.currentValue;
  }
  if (extras.limit !== undefined) {
    definedExtras.limit = extras.limit;
  }
  if (extras.suggestedQuantity !== undefined) {
    definedExtras.suggestedQuantity = extras.suggestedQuantity;
  }
  if (extras.fixHint !== undefined) {
    definedExtras.fixHint = extras.fixHint;
  }
  return {
    code,
    title,
    message,
    ...definedExtras
  };
};

export const calculatePositionSize = (
  equity: number,
  maxRiskPerTradePercent: number,
  entryPrice: number,
  stopLossPrice: number
): number => {
  if (equity <= 0 || maxRiskPerTradePercent <= 0 || entryPrice <= 0 || stopLossPrice <= 0) {
    return 0;
  }

  const riskAmount = equity * (maxRiskPerTradePercent / 100);
  const stopLossDistance = Math.abs(entryPrice - stopLossPrice);
  if (stopLossDistance <= 0) {
    return 0;
  }

  return round(riskAmount / stopLossDistance, 4);
};

export interface TradeCostAssumptions {
  /** Flat cost charged per fill, in account currency. */
  readonly feePerTrade: number;
  /** Expected slippage per fill, as a percent of price (e.g. 0.05 = 0.05%). */
  readonly slippagePercent: number;
}

/**
 * Round-trip trading cost in basis points. Slippage and the flat fee are each paid
 * twice — once entering the position, once exiting it.
 */
export const estimateRoundTripCostBps = (
  notionalUsd: number,
  costs: TradeCostAssumptions
): number => {
  if (notionalUsd <= 0) {
    return 0;
  }
  const slippageBps = Math.max(0, costs.slippagePercent) * 100 * 2;
  const feeBps = (Math.max(0, costs.feePerTrade) * 2 * 10_000) / notionalUsd;
  return round(slippageBps + feeBps, 2);
};

/**
 * Expected profit distance minus round-trip trading costs, in basis points. A trade
 * whose net edge is negative or too thin cannot clear its own fees and slippage even
 * if the signal is directionally correct.
 */
export const estimateNetEdgeBps = (
  expectedMoveBps: number,
  notionalUsd: number,
  costs: TradeCostAssumptions
): number => round(expectedMoveBps - estimateRoundTripCostBps(notionalUsd, costs), 2);

const suggestSafeQuantity = (
  rules: RiskRules,
  context: RiskContext,
  intent: TradeIntent,
  calculatedQuantity: number
): number | undefined => {
  if (intent.price <= 0 || intent.stopLoss <= 0 || context.equity <= 0) {
    return undefined;
  }

  const stopDistance = Math.abs(intent.price - intent.stopLoss);
  if (stopDistance <= 0) {
    return undefined;
  }

  const maxByRisk = (context.equity * (rules.maxRiskPerTradePercent / 100)) / stopDistance;
  const maxByPosition = (context.equity * (rules.maxPositionSizePercent / 100)) / intent.price;
  const maxByCash = intent.side === "BUY" ? context.cashBalance / intent.price : Number.POSITIVE_INFINITY;
  const capped = Math.min(maxByRisk, maxByPosition, maxByCash, calculatedQuantity);
  const safe = round(Math.max(0, capped * 0.95), 4);
  return safe > 0 ? safe : undefined;
};

export const validateTradeRisk = (
  rules: RiskRules,
  context: RiskContext,
  intent: TradeIntent
): RiskDecision => {
  const rejections: RiskRejection[] = [];

  if (rules.stopTrading) {
    rejections.push(
      rejection(
        "TRADING_STOPPED",
        "Trading is paused",
        "Risk controls have stopped all trading for this account.",
        { fixHint: "Disable the emergency stop in Risk settings before placing new orders." }
      )
    );
  }

  if (context.equity <= 0) {
    rejections.push(
      rejection(
        "INVALID_EQUITY",
        "Portfolio equity unavailable",
        "Portfolio equity must be positive before risk can size a trade.",
        { currentValue: context.equity, fixHint: "Connect a broker or wait for portfolio sync." }
      )
    );
  }

  if (intent.price <= 0) {
    rejections.push(
      rejection(
        "INVALID_ENTRY_PRICE",
        "Entry price unavailable",
        "Entry price must be a positive live or reference price.",
        { currentValue: intent.price, fixHint: "Wait for market data or enter a valid reference price." }
      )
    );
  }

  if (intent.stopLoss <= 0) {
    rejections.push(
      rejection(
        "INVALID_STOP_LOSS",
        "Stop loss required",
        "Every trade must include a positive stop-loss.",
        { currentValue: intent.stopLoss, fixHint: "Set a stop loss on the protective side of entry." }
      )
    );
  }

  if (intent.takeProfit <= 0) {
    rejections.push(
      rejection(
        "INVALID_TAKE_PROFIT",
        "Take profit required",
        "Every trade must include a positive take-profit.",
        { currentValue: intent.takeProfit, fixHint: "Set a take profit beyond the entry price." }
      )
    );
  }

  if (intent.side === "BUY" && intent.stopLoss > 0 && intent.price > 0 && intent.stopLoss >= intent.price) {
    rejections.push(
      rejection(
        "STOP_LOSS_GEOMETRY",
        "Stop loss is on the wrong side",
        "For a long trade, stop loss must be below the entry price.",
        {
          currentValue: intent.stopLoss,
          limit: intent.price,
          fixHint: `Move stop loss below ${intent.price.toFixed(2)}.`
        }
      )
    );
  }

  if (intent.side === "SELL" && intent.stopLoss > 0 && intent.price > 0 && intent.stopLoss <= intent.price) {
    rejections.push(
      rejection(
        "STOP_LOSS_GEOMETRY",
        "Stop loss is on the wrong side",
        "For a short trade, stop loss must be above the entry price.",
        {
          currentValue: intent.stopLoss,
          limit: intent.price,
          fixHint: `Move stop loss above ${intent.price.toFixed(2)}.`
        }
      )
    );
  }

  if (intent.side === "BUY" && intent.takeProfit > 0 && intent.price > 0 && intent.takeProfit <= intent.price) {
    rejections.push(
      rejection(
        "TAKE_PROFIT_GEOMETRY",
        "Take profit is on the wrong side",
        "For a long trade, take profit must be above the entry price.",
        {
          currentValue: intent.takeProfit,
          limit: intent.price,
          fixHint: `Move take profit above ${intent.price.toFixed(2)}.`
        }
      )
    );
  }

  if (intent.side === "SELL" && intent.takeProfit > 0 && intent.price > 0 && intent.takeProfit >= intent.price) {
    rejections.push(
      rejection(
        "TAKE_PROFIT_GEOMETRY",
        "Take profit is on the wrong side",
        "For a short trade, take profit must be below the entry price.",
        {
          currentValue: intent.takeProfit,
          limit: intent.price,
          fixHint: `Move take profit below ${intent.price.toFixed(2)}.`
        }
      )
    );
  }

  // Real $10-style stakes need fractional shares and wider % room than institutional defaults.
  const microStake = context.equity > 0 && context.equity <= 50;
  const effectiveRiskPercent = microStake
    ? Math.max(rules.maxRiskPerTradePercent, 20)
    : rules.maxRiskPerTradePercent;
  const effectivePositionPercent = microStake
    ? Math.max(rules.maxPositionSizePercent, 95)
    : rules.maxPositionSizePercent;

  let calculatedQuantity = calculatePositionSize(
    context.equity,
    effectiveRiskPercent,
    intent.price,
    intent.stopLoss
  );
  if (microStake && intent.side === "BUY" && intent.price > 0) {
    // Cash is the hard ceiling on a real $10 stake — never size above buying power.
    const microNotional = Math.min(
      context.cashBalance * 0.85,
      context.equity * ((effectivePositionPercent - 1) / 100)
    );
    const microQty = round(microNotional / intent.price, 4);
    if (microQty > 0) {
      calculatedQuantity = calculatedQuantity > 0 ? Math.min(calculatedQuantity, microQty) : microQty;
    }
  }
  const quantity = intent.requestedQuantity ?? calculatedQuantity;
  const existingQuantity = context.existingPositionQuantity ?? 0;
  const signedQuantity = intent.side === "BUY" ? quantity : -quantity;
  const projectedQuantity = existingQuantity + signedQuantity;
  const reducesExposure =
    existingQuantity !== 0 &&
    Math.sign(existingQuantity) !== Math.sign(signedQuantity) &&
    Math.abs(projectedQuantity) <= Math.abs(existingQuantity);

  if (quantity <= 0) {
    rejections.push(
      rejection(
        "ZERO_POSITION_SIZE",
        "Position size is zero",
        "Calculated position size must be greater than zero.",
        {
          currentValue: quantity,
          fixHint: microStake
            ? "Micro stakes use fractional shares — confirm Alpaca fractional trading is enabled."
            : "Widen stop distance or increase equity before sizing."
        }
      )
    );
  }

  const proposedRiskAmount = round(Math.abs(intent.price - intent.stopLoss) * quantity, 2);
  const maxRiskAmount = round(context.equity * (effectiveRiskPercent / 100), 2);
  if (!reducesExposure && quantity > 0 && proposedRiskAmount > maxRiskAmount) {
    const suggested = suggestSafeQuantity(rules, context, intent, calculatedQuantity);
    rejections.push(
      rejection(
        "MAX_RISK_PER_TRADE_EXCEEDED",
        "Trade risk is too high",
        `This order risks $${proposedRiskAmount.toFixed(2)}, which exceeds your $${maxRiskAmount.toFixed(2)} per-trade allowance (${effectiveRiskPercent}% of equity${microStake ? ", micro-stake mode" : ""}).`,
        {
          currentValue: proposedRiskAmount,
          limit: maxRiskAmount,
          suggestedQuantity: suggested,
          fixHint: suggested
            ? `Reduce quantity to about ${suggested} shares to stay within risk limits.`
            : "Reduce quantity or tighten the stop-loss distance."
        }
      )
    );
  }

  const proposedPositionValue = round(intent.price * quantity, 2);
  const maxPositionValue = round(context.equity * (effectivePositionPercent / 100), 2);
  const projectedPositionValue =
    context.existingPositionQuantity === undefined
      ? proposedPositionValue + context.existingPositionValue
      : round(Math.abs(projectedQuantity) * intent.price, 2);
  if (!reducesExposure && quantity > 0 && projectedPositionValue > maxPositionValue) {
    const positionPercent =
      context.equity > 0 ? round((projectedPositionValue / context.equity) * 100, 2) : 0;
    const suggested = suggestSafeQuantity(rules, context, intent, calculatedQuantity);
    rejections.push(
      rejection(
        "MAX_POSITION_SIZE_EXCEEDED",
        "Position is too large",
        `This order would use ${positionPercent}% of the portfolio. Your maximum is ${effectivePositionPercent}%.`,
        {
          currentValue: positionPercent,
          limit: effectivePositionPercent,
          suggestedQuantity: suggested,
          fixHint: suggested
            ? `Use a suggested quantity of ${suggested} to stay within the position-size limit.`
            : "Reduce quantity so position value stays within the configured percentage."
        }
      )
    );
  }

  const dailyLossLimit = round(context.equity * (rules.maxDailyLossPercent / 100), 2);
  if (!reducesExposure && Math.abs(Math.min(context.dailyRealizedPnl, 0)) >= dailyLossLimit) {
    rejections.push(
      rejection(
        "DAILY_LOSS_LIMIT_REACHED",
        "Daily loss limit reached",
        `Realized losses today have reached the $${dailyLossLimit.toFixed(2)} daily loss limit.`,
        {
          currentValue: Math.abs(Math.min(context.dailyRealizedPnl, 0)),
          limit: dailyLossLimit,
          fixHint: "Wait until the next session or raise the daily loss limit after review."
        }
      )
    );
  }

  if (!reducesExposure && context.currentDrawdownPercent >= rules.maxDrawdownPercent) {
    rejections.push(
      rejection(
        "MAX_DRAWDOWN_REACHED",
        "Maximum drawdown reached",
        `Current drawdown is ${context.currentDrawdownPercent.toFixed(2)}%, at or above your ${rules.maxDrawdownPercent}% limit.`,
        {
          currentValue: context.currentDrawdownPercent,
          limit: rules.maxDrawdownPercent,
          fixHint: "Pause trading until drawdown recovers or adjust the drawdown limit deliberately."
        }
      )
    );
  }

  const weeklyLossLimit = round(
    context.equity * ((rules.maxWeeklyLossPercent ?? DEFAULT_MAX_WEEKLY_LOSS_PERCENT) / 100),
    2
  );
  const weeklyLoss = Math.abs(Math.min(context.weeklyRealizedPnl ?? 0, 0));
  if (!reducesExposure && weeklyLossLimit > 0 && weeklyLoss >= weeklyLossLimit) {
    rejections.push(
      rejection(
        "WEEKLY_LOSS_LIMIT_REACHED",
        "Weekly loss limit reached",
        `Realized losses over the last 7 days have reached the $${weeklyLossLimit.toFixed(2)} weekly limit.`,
        {
          currentValue: weeklyLoss,
          limit: weeklyLossLimit,
          fixHint: "Wait for the rolling week to roll off or raise the weekly limit after review."
        }
      )
    );
  }

  const consecutiveLossLimit = rules.maxConsecutiveLosses ?? DEFAULT_MAX_CONSECUTIVE_LOSSES;
  if (!reducesExposure && consecutiveLossLimit > 0 && (context.consecutiveLosses ?? 0) >= consecutiveLossLimit) {
    rejections.push(
      rejection(
        "CONSECUTIVE_LOSS_LOCK",
        "Consecutive loss circuit breaker",
        `${context.consecutiveLosses} losing trades in a row reached the ${consecutiveLossLimit}-loss circuit breaker.`,
        {
          currentValue: context.consecutiveLosses ?? 0,
          limit: consecutiveLossLimit,
          fixHint: "Review the strategy before re-enabling; the breaker clears after the next winning trade."
        }
      )
    );
  }

  // Opening a brand-new symbol is what counts against the cap; adding to or exiting an
  // existing position does not increase the number of things that can go wrong at once.
  const opensNewSymbol = existingQuantity === 0 && quantity > 0;
  const concurrentLimit = rules.maxConcurrentPositions ?? DEFAULT_MAX_CONCURRENT_POSITIONS;
  if (opensNewSymbol && concurrentLimit > 0 && (context.openPositionCount ?? 0) >= concurrentLimit) {
    rejections.push(
      rejection(
        "MAX_CONCURRENT_POSITIONS",
        "Too many open positions",
        `${context.openPositionCount} positions are already open, at the ${concurrentLimit}-position limit.`,
        {
          currentValue: context.openPositionCount ?? 0,
          limit: concurrentLimit,
          fixHint: "Close an existing position or raise the concurrent-position limit."
        }
      )
    );
  }

  // Never average down: adding to a position that is already underwater turns a bounded
  // loss into an unbounded one, which is the single fastest way to lose the account.
  const addsToExisting =
    existingQuantity !== 0 && quantity > 0 && Math.sign(existingQuantity) === Math.sign(signedQuantity);
  if (addsToExisting && context.existingAveragePrice !== undefined && context.existingAveragePrice > 0) {
    const underwater =
      existingQuantity > 0
        ? intent.price < context.existingAveragePrice
        : intent.price > context.existingAveragePrice;
    if (underwater) {
      rejections.push(
        rejection(
          "AVERAGING_DOWN_BLOCKED",
          "Averaging down is not allowed",
          `${intent.symbol} is already open at ${context.existingAveragePrice.toFixed(2)} and is underwater at ${intent.price.toFixed(2)}; adding to a losing position is blocked.`,
          {
            currentValue: intent.price,
            limit: context.existingAveragePrice,
            fixHint: "Exit or let the stop work instead of increasing size against the position."
          }
        )
      );
    }
  }

  if (intent.side === "BUY" && !reducesExposure && quantity > 0 && proposedPositionValue > context.cashBalance) {
    const suggested = suggestSafeQuantity(rules, context, intent, calculatedQuantity);
    rejections.push(
      rejection(
        "INSUFFICIENT_CASH",
        "Not enough buying power",
        `Order value $${proposedPositionValue.toFixed(2)} exceeds available cash $${context.cashBalance.toFixed(2)}.`,
        {
          currentValue: proposedPositionValue,
          limit: context.cashBalance,
          suggestedQuantity: suggested,
          fixHint: suggested
            ? `Lower quantity to about ${suggested} based on available cash.`
            : "Reduce quantity or free cash by closing positions."
        }
      )
    );
  }

  const suggestedQuantity =
    rejections.map((item) => item.suggestedQuantity).find((value) => typeof value === "number") ??
    (rejections.length === 0 ? undefined : suggestSafeQuantity(rules, context, intent, calculatedQuantity));

  return {
    approved: rejections.length === 0,
    reasons: rejections.map((item) => item.message),
    maxRiskAmount,
    proposedRiskAmount,
    proposedPositionValue,
    calculatedQuantity,
    rejections,
    ...(suggestedQuantity === undefined ? {} : { suggestedQuantity })
  };
};
