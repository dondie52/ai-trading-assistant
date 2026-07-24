import { describe, expect, it } from "vitest";
import type { MarketQuote, RiskRules, Signal } from "@trading/types";
import { buildOrderDraftFromSignal, clientOrderValidation } from "./order-draft";
import { insufficientHistoryLabel, maskAccountId } from "./format";
import { ApiError } from "./api";
import { parseStructuredRiskError } from "./risk-display";

const risk: RiskRules = {
  id: "risk-1",
  userId: "user-1",
  maxRiskPerTradePercent: 1,
  maxDailyLossPercent: 3,
  maxDrawdownPercent: 12,
  maxPositionSizePercent: 25,
  stopTrading: false,
  updatedAt: new Date().toISOString()
};

const buySignal: Signal = {
  id: "sig-1",
  userId: "user-1",
  strategyId: "strat-1",
  symbol: "AAPL",
  signalType: "BUY",
  confidenceScore: 72,
  modelVersion: "test",
  features: { latestClose: 100, atr14: 1.2, rsi14: 48 },
  generatedAt: new Date().toISOString()
};

const quote: MarketQuote = {
  symbol: "AAPL",
  price: 100,
  bid: 99.9,
  ask: 100.1,
  changePercent: 0.4,
  timestamp: new Date().toISOString(),
  source: "SIMULATED"
};

describe("order draft autofill", () => {
  it("builds a long order with stop below and take-profit above entry", () => {
    const draft = buildOrderDraftFromSignal({
      signal: buySignal,
      quote,
      equity: 10_000,
      risk
    });

    expect(draft).not.toBeNull();
    expect(draft?.side).toBe("BUY");
    expect(draft?.price).toBe(100);
    expect(draft?.stopLoss).toBeLessThan(100);
    expect(draft?.takeProfit).toBeGreaterThan(100);
    expect(draft?.quantity).toBeGreaterThan(0);
    expect(draft?.priceAvailable).toBe(true);
  });

  it("builds a short order with inverted protective levels", () => {
    const draft = buildOrderDraftFromSignal({
      signal: { ...buySignal, signalType: "SELL" },
      quote,
      equity: 10_000,
      risk
    });

    expect(draft?.side).toBe("SELL");
    expect(draft?.stopLoss).toBeGreaterThan(100);
    expect(draft?.takeProfit).toBeLessThan(100);
  });

  it("returns unavailable state when market data is missing", () => {
    const draft = buildOrderDraftFromSignal({
      signal: { ...buySignal, features: {} },
      quote: { ...quote, source: "UNAVAILABLE", price: 0 },
      equity: 10_000,
      risk
    });

    expect(draft?.priceAvailable).toBe(false);
    expect(draft?.quantity).toBe(0);
  });

  it("returns null for hold signals", () => {
    expect(
      buildOrderDraftFromSignal({
        signal: { ...buySignal, signalType: "HOLD" },
        quote,
        equity: 10_000,
        risk
      })
    ).toBeNull();
  });
});

describe("client order validation", () => {
  it("flags long geometry, broker, and size issues", () => {
    const errors = clientOrderValidation({
      side: "BUY",
      price: 100,
      stopLoss: 105,
      takeProfit: 90,
      quantity: 50,
      priceAvailable: true,
      brokerConnected: false,
      equity: 10_000,
      maxPositionSizePercent: 10,
      maxRiskPerTradePercent: 1
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "Broker account is not connected.",
        "Stop loss must be below entry for a long trade.",
        "Take profit must be above entry for a long trade.",
        "Quantity exceeds the configured position-size limit.",
        "Maximum expected loss exceeds the per-trade risk allowance."
      ])
    );
  });

  it("flags unavailable live price", () => {
    const errors = clientOrderValidation({
      side: "BUY",
      price: 0,
      stopLoss: 0,
      takeProfit: 0,
      quantity: 1,
      priceAvailable: false,
      brokerConnected: true
    });
    expect(errors).toContain("Live price is unavailable.");
  });
});

describe("structured risk display", () => {
  it("parses structured risk rejection payloads", () => {
    const parsed = parseStructuredRiskError(
      new ApiError("MAX_POSITION_SIZE_EXCEEDED", "Position is too large", 422, {
        approved: false,
        code: "MAX_POSITION_SIZE_EXCEEDED",
        title: "Position is too large",
        message: "This order would use 18% of the portfolio. Your maximum is 10%.",
        currentValue: 18,
        limit: 10,
        suggestedQuantity: 4,
        fixHint: "Use a suggested quantity of 4.",
        rejections: []
      })
    );

    expect(parsed?.code).toBe("MAX_POSITION_SIZE_EXCEEDED");
    expect(parsed?.suggestedQuantity).toBe(4);
    expect(parsed?.limit).toBe(10);
  });
});

describe("empty history helpers", () => {
  it("explains insufficient history", () => {
    expect(insufficientHistoryLabel(0)).toBe("Not enough trade history");
    expect(insufficientHistoryLabel(3)).toBe("Available after 5 closed trades");
    expect(insufficientHistoryLabel(5)).toBe("");
  });

  it("masks account identifiers", () => {
    expect(maskAccountId("ABCDEFGHIJK")).toBe("ABCD…HIJK");
  });
});
