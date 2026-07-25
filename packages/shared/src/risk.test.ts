import { describe, expect, it } from "vitest";
import type { RiskRules } from "@trading/types";
import { calculatePositionSize, validateTradeRisk } from "./risk.js";

const rules: RiskRules = {
  id: "risk-1",
  userId: "user-1",
  maxRiskPerTradePercent: 1,
  maxDailyLossPercent: 3,
  maxDrawdownPercent: 12,
  maxPositionSizePercent: 25,
  stopTrading: false,
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString()
};

describe("risk engine", () => {
  it("calculates risk-based position size from stop-loss distance", () => {
    expect(calculatePositionSize(10_000, 1, 100, 95)).toBe(20);
  });

  it("sizes fractional SPY lots for a real $10 micro stake", () => {
    const decision = validateTradeRisk(
      rules,
      {
        equity: 10,
        cashBalance: 10,
        dailyRealizedPnl: 0,
        currentDrawdownPercent: 0,
        existingPositionValue: 0
      },
      {
        symbol: "SPY",
        side: "BUY",
        price: 738.63,
        stopLoss: 720,
        takeProfit: 760
      }
    );

    expect(decision.approved).toBe(true);
    expect(decision.calculatedQuantity).toBeGreaterThan(0);
    expect(decision.calculatedQuantity).toBeLessThan(0.02);
    expect(decision.proposedPositionValue).toBeLessThanOrEqual(10);
  });

  it("approves a trade that stays inside every risk rule", () => {
    const decision = validateTradeRisk(
      rules,
      {
        equity: 10_000,
        cashBalance: 10_000,
        dailyRealizedPnl: 0,
        currentDrawdownPercent: 1,
        existingPositionValue: 0
      },
      {
        symbol: "AAPL",
        side: "BUY",
        price: 100,
        stopLoss: 95,
        takeProfit: 112
      }
    );

    expect(decision.approved).toBe(true);
    expect(decision.calculatedQuantity).toBe(20);
    expect(decision.rejections).toEqual([]);
  });

  it("rejects a trade that exceeds max risk per trade with structured details", () => {
    const decision = validateTradeRisk(
      rules,
      {
        equity: 10_000,
        cashBalance: 10_000,
        dailyRealizedPnl: 0,
        currentDrawdownPercent: 1,
        existingPositionValue: 0
      },
      {
        symbol: "AAPL",
        side: "BUY",
        price: 100,
        stopLoss: 90,
        takeProfit: 120,
        requestedQuantity: 50
      }
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejections?.[0]?.code).toBe("MAX_RISK_PER_TRADE_EXCEEDED");
    expect(decision.rejections?.[0]?.title).toBe("Trade risk is too high");
    expect(decision.suggestedQuantity).toBeGreaterThan(0);
    expect(decision.suggestedQuantity).toBeLessThan(50);
  });

  it("blocks invalid stop-loss placement before execution", () => {
    const decision = validateTradeRisk(
      rules,
      {
        equity: 10_000,
        cashBalance: 10_000,
        dailyRealizedPnl: 0,
        currentDrawdownPercent: 1,
        existingPositionValue: 0
      },
      {
        symbol: "AAPL",
        side: "BUY",
        price: 100,
        stopLoss: 101,
        takeProfit: 108
      }
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejections?.[0]?.code).toBe("STOP_LOSS_GEOMETRY");
    expect(decision.reasons[0]).toContain("stop loss must be below");
  });

  it("allows an exit that reduces exposure even after entry limits are reached", () => {
    const decision = validateTradeRisk(
      {
        ...rules,
        maxPositionSizePercent: 5
      },
      {
        equity: 10_000,
        cashBalance: 100,
        dailyRealizedPnl: -500,
        currentDrawdownPercent: 20,
        existingPositionValue: 2_000,
        existingPositionQuantity: 10
      },
      {
        symbol: "AAPL",
        side: "SELL",
        price: 200,
        stopLoss: 210,
        takeProfit: 180,
        requestedQuantity: 5
      }
    );

    expect(decision.approved).toBe(true);
  });

  it("returns zero position size for invalid account or stop inputs", () => {
    expect(calculatePositionSize(0, 1, 100, 95)).toBe(0);
    expect(calculatePositionSize(10_000, 1, 100, 100)).toBe(0);
  });

  it("collects independent safety failures for malformed and disabled trades", () => {
    const decision = validateTradeRisk(
      { ...rules, stopTrading: true },
      {
        equity: 0,
        cashBalance: 0,
        dailyRealizedPnl: 0,
        currentDrawdownPercent: 0,
        existingPositionValue: 0
      },
      {
        symbol: "AAPL",
        side: "BUY",
        price: 0,
        stopLoss: 0,
        takeProfit: 0
      }
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejections?.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "TRADING_STOPPED",
        "INVALID_EQUITY",
        "INVALID_ENTRY_PRICE",
        "INVALID_STOP_LOSS",
        "INVALID_TAKE_PROFIT",
        "ZERO_POSITION_SIZE"
      ])
    );
  });

  it("enforces sell geometry, drawdown, daily loss, position, and cash limits", () => {
    const sell = validateTradeRisk(
      rules,
      {
        equity: 10_000,
        cashBalance: 10_000,
        dailyRealizedPnl: 0,
        currentDrawdownPercent: 0,
        existingPositionValue: 0
      },
      {
        symbol: "AAPL",
        side: "SELL",
        price: 100,
        stopLoss: 99,
        takeProfit: 101,
        requestedQuantity: 1
      }
    );
    expect(sell.rejections?.map((item) => item.code)).toEqual(
      expect.arrayContaining(["STOP_LOSS_GEOMETRY", "TAKE_PROFIT_GEOMETRY"])
    );

    const constrained = validateTradeRisk(
      { ...rules, maxPositionSizePercent: 5 },
      {
        equity: 10_000,
        cashBalance: 100,
        dailyRealizedPnl: -300,
        currentDrawdownPercent: 12,
        existingPositionValue: 0
      },
      {
        symbol: "AAPL",
        side: "BUY",
        price: 100,
        stopLoss: 95,
        takeProfit: 110,
        requestedQuantity: 20
      }
    );
    expect(constrained.rejections?.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "MAX_POSITION_SIZE_EXCEEDED",
        "DAILY_LOSS_LIMIT_REACHED",
        "MAX_DRAWDOWN_REACHED",
        "INSUFFICIENT_CASH"
      ])
    );
    expect(constrained.suggestedQuantity).toBeGreaterThan(0);
  });

  it("suggests a safe quantity when position size percent is exceeded", () => {
    const decision = validateTradeRisk(
      { ...rules, maxPositionSizePercent: 10 },
      {
        equity: 10_000,
        cashBalance: 10_000,
        dailyRealizedPnl: 0,
        currentDrawdownPercent: 0,
        existingPositionValue: 0
      },
      {
        symbol: "AAPL",
        side: "BUY",
        price: 100,
        stopLoss: 98,
        takeProfit: 110,
        requestedQuantity: 18
      }
    );

    expect(decision.approved).toBe(false);
    const positionRejection = decision.rejections?.find((item) => item.code === "MAX_POSITION_SIZE_EXCEEDED");
    expect(positionRejection?.currentValue).toBe(18);
    expect(positionRejection?.limit).toBe(10);
    const suggestedQuantity = positionRejection?.suggestedQuantity;
    expect(suggestedQuantity).toBeDefined();
    if (suggestedQuantity === undefined) {
      throw new Error("Expected suggested quantity for position-size rejection.");
    }
    expect(suggestedQuantity).toBeLessThanOrEqual(10);
  });
});
