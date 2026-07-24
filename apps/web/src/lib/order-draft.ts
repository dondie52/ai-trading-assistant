import type { JsonObject, MarketQuote, OrderSide, RiskRules, Signal } from "@trading/types";
import { calculatePositionSize } from "../../../../packages/shared/src/risk";

export interface OrderDraft {
  readonly symbol: string;
  readonly side: OrderSide;
  readonly orderType: "MARKET" | "LIMIT" | "STOP";
  readonly quantity: number;
  readonly price: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly riskRewardRatio: number;
  readonly estimatedValue: number;
  readonly maxExpectedLoss: number;
  readonly reasoning: string;
  readonly risks: readonly string[];
  readonly confidence: number;
  readonly signalType: Signal["signalType"];
  readonly priceAvailable: boolean;
}

const featureNumber = (features: JsonObject, key: string): number | null => {
  const value = features[key];
  return typeof value === "number" ? value : null;
};

export const buildOrderDraftFromSignal = (input: {
  readonly signal: Signal;
  readonly quote?: MarketQuote | null;
  readonly equity: number;
  readonly risk?: RiskRules | null;
  readonly stopLossPercent?: number;
  readonly takeProfitPercent?: number;
}): OrderDraft | null => {
  const { signal, quote, equity, risk } = input;
  if (signal.signalType === "HOLD") {
    return null;
  }

  const livePrice = quote?.source !== "UNAVAILABLE" && quote?.price && quote.price > 0 ? quote.price : null;
  const featurePrice = featureNumber(signal.features, "latestClose");
  const price = livePrice ?? (featurePrice && featurePrice > 0 ? featurePrice : null);
  const priceAvailable = price !== null && price > 0;
  if (!priceAvailable || price === null) {
    return {
      symbol: signal.symbol,
      side: signal.signalType,
      orderType: "MARKET",
      quantity: 0,
      price: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskRewardRatio: 0,
      estimatedValue: 0,
      maxExpectedLoss: 0,
      reasoning: "Live market price is unavailable. Execution is disabled until a quote is loaded.",
      risks: ["Market data unavailable"],
      confidence: signal.confidenceScore,
      signalType: signal.signalType,
      priceAvailable: false
    };
  }

  const side = signal.signalType;
  const stopLossPercent = input.stopLossPercent ?? 2;
  const takeProfitPercent = input.takeProfitPercent ?? 5;
  const stopLoss =
    side === "BUY" ? price * (1 - stopLossPercent / 100) : price * (1 + stopLossPercent / 100);
  const takeProfit =
    side === "BUY" ? price * (1 + takeProfitPercent / 100) : price * (1 - takeProfitPercent / 100);
  const quantity = calculatePositionSize(
    equity,
    risk?.maxRiskPerTradePercent ?? 1,
    price,
    stopLoss
  );
  const riskAmount = Math.abs(price - stopLoss) * quantity;
  const rewardAmount = Math.abs(takeProfit - price) * quantity;
  const atr = featureNumber(signal.features, "atr14");
  const rsi = featureNumber(signal.features, "rsi14");
  const reasoningParts = [
    `${side} bias at ${signal.confidenceScore}% confidence.`,
    rsi !== null ? `RSI ${rsi.toFixed(1)}.` : null,
    atr !== null ? `ATR ${atr.toFixed(2)}.` : null
  ].filter(Boolean);

  const risks = [
    atr !== null && atr / price > 0.03 ? "Elevated volatility versus price" : null,
    signal.confidenceScore < 65 ? "Confidence below preferred assisted threshold" : null,
    quote?.source === "SIMULATED" ? "Price source is simulated paper data" : null
  ].filter((item): item is string => Boolean(item));

  return {
    symbol: signal.symbol,
    side,
    orderType: "MARKET",
    quantity: Number(quantity.toFixed(4)),
    price: Number(price.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2)),
    takeProfit: Number(takeProfit.toFixed(2)),
    riskRewardRatio: riskAmount > 0 ? Number((rewardAmount / riskAmount).toFixed(2)) : 0,
    estimatedValue: Number((price * quantity).toFixed(2)),
    maxExpectedLoss: Number(riskAmount.toFixed(2)),
    reasoning: reasoningParts.join(" "),
    risks: risks.length > 0 ? risks : ["Standard market and gap risk applies"],
    confidence: signal.confidenceScore,
    signalType: signal.signalType,
    priceAvailable: true
  };
};

export const clientOrderValidation = (draft: {
  readonly side: OrderSide;
  readonly price: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly quantity: number;
  readonly priceAvailable: boolean;
  readonly brokerConnected: boolean;
  readonly maxPositionSizePercent?: number;
  readonly maxRiskPerTradePercent?: number;
  readonly equity?: number;
}): readonly string[] => {
  const errors: string[] = [];
  if (!draft.brokerConnected) {
    errors.push("Broker account is not connected.");
  }
  if (!draft.priceAvailable || draft.price <= 0) {
    errors.push("Live price is unavailable.");
  }
  if (draft.quantity <= 0) {
    errors.push("Quantity must be greater than zero.");
  }
  if (draft.side === "BUY" && draft.stopLoss >= draft.price && draft.price > 0) {
    errors.push("Stop loss must be below entry for a long trade.");
  }
  if (draft.side === "SELL" && draft.stopLoss <= draft.price && draft.price > 0) {
    errors.push("Stop loss must be above entry for a short trade.");
  }
  if (draft.side === "BUY" && draft.takeProfit <= draft.price && draft.price > 0) {
    errors.push("Take profit must be above entry for a long trade.");
  }
  if (draft.side === "SELL" && draft.takeProfit >= draft.price && draft.price > 0) {
    errors.push("Take profit must be below entry for a short trade.");
  }
  if (
    draft.equity &&
    draft.maxPositionSizePercent &&
    draft.price * draft.quantity > draft.equity * (draft.maxPositionSizePercent / 100)
  ) {
    errors.push("Quantity exceeds the configured position-size limit.");
  }
  if (
    draft.equity &&
    draft.maxRiskPerTradePercent &&
    Math.abs(draft.price - draft.stopLoss) * draft.quantity >
      draft.equity * (draft.maxRiskPerTradePercent / 100)
  ) {
    errors.push("Maximum expected loss exceeds the per-trade risk allowance.");
  }
  return errors;
};
