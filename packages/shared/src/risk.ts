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
}

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

  const calculatedQuantity = calculatePositionSize(
    context.equity,
    rules.maxRiskPerTradePercent,
    intent.price,
    intent.stopLoss
  );
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
        { currentValue: quantity, fixHint: "Widen stop distance or increase equity before sizing." }
      )
    );
  }

  const proposedRiskAmount = round(Math.abs(intent.price - intent.stopLoss) * quantity, 2);
  const maxRiskAmount = round(context.equity * (rules.maxRiskPerTradePercent / 100), 2);
  if (!reducesExposure && quantity > 0 && proposedRiskAmount > maxRiskAmount) {
    const suggested = suggestSafeQuantity(rules, context, intent, calculatedQuantity);
    rejections.push(
      rejection(
        "MAX_RISK_PER_TRADE_EXCEEDED",
        "Trade risk is too high",
        `This order risks $${proposedRiskAmount.toFixed(2)}, which exceeds your $${maxRiskAmount.toFixed(2)} per-trade allowance (${rules.maxRiskPerTradePercent}% of equity).`,
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
  const maxPositionValue = round(context.equity * (rules.maxPositionSizePercent / 100), 2);
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
        `This order would use ${positionPercent}% of the portfolio. Your maximum is ${rules.maxPositionSizePercent}%.`,
        {
          currentValue: positionPercent,
          limit: rules.maxPositionSizePercent,
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
