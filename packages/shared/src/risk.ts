import type { OrderSide, RiskDecision, RiskRules } from "@trading/types";

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

export const validateTradeRisk = (
  rules: RiskRules,
  context: RiskContext,
  intent: TradeIntent
): RiskDecision => {
  const reasons: string[] = [];

  if (rules.stopTrading) {
    reasons.push("Trading is stopped by risk controls.");
  }

  if (context.equity <= 0) {
    reasons.push("Portfolio equity must be positive.");
  }

  if (intent.price <= 0) {
    reasons.push("Entry price must be positive.");
  }

  if (intent.stopLoss <= 0) {
    reasons.push("Every trade must include a positive stop-loss.");
  }

  if (intent.takeProfit <= 0) {
    reasons.push("Every trade must include a positive take-profit.");
  }

  if (intent.side === "BUY" && intent.stopLoss >= intent.price) {
    reasons.push("Buy stop-loss must be below entry price.");
  }

  if (intent.side === "SELL" && intent.stopLoss <= intent.price) {
    reasons.push("Sell stop-loss must be above entry price.");
  }

  if (intent.side === "BUY" && intent.takeProfit <= intent.price) {
    reasons.push("Buy take-profit must be above entry price.");
  }

  if (intent.side === "SELL" && intent.takeProfit >= intent.price) {
    reasons.push("Sell take-profit must be below entry price.");
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
    reasons.push("Calculated position size must be greater than zero.");
  }

  const proposedRiskAmount = round(Math.abs(intent.price - intent.stopLoss) * quantity, 2);
  const maxRiskAmount = round(context.equity * (rules.maxRiskPerTradePercent / 100), 2);
  if (!reducesExposure && proposedRiskAmount > maxRiskAmount) {
    reasons.push("Trade exceeds maximum risk per trade.");
  }

  const proposedPositionValue = round(intent.price * quantity, 2);
  const maxPositionValue = round(context.equity * (rules.maxPositionSizePercent / 100), 2);
  const projectedPositionValue =
    context.existingPositionQuantity === undefined
      ? proposedPositionValue + context.existingPositionValue
      : round(Math.abs(projectedQuantity) * intent.price, 2);
  if (!reducesExposure && projectedPositionValue > maxPositionValue) {
    reasons.push("Trade exceeds maximum position size.");
  }

  const dailyLossLimit = round(context.equity * (rules.maxDailyLossPercent / 100), 2);
  if (!reducesExposure && Math.abs(Math.min(context.dailyRealizedPnl, 0)) >= dailyLossLimit) {
    reasons.push("Daily loss limit has been reached.");
  }

  if (!reducesExposure && context.currentDrawdownPercent >= rules.maxDrawdownPercent) {
    reasons.push("Maximum drawdown limit has been reached.");
  }

  if (intent.side === "BUY" && !reducesExposure && proposedPositionValue > context.cashBalance) {
    reasons.push("Cash balance is insufficient for the proposed buy order.");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    maxRiskAmount,
    proposedRiskAmount,
    proposedPositionValue,
    calculatedQuantity
  };
};
