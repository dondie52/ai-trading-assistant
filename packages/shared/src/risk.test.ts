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
  });

  it("rejects a trade that exceeds max risk per trade", () => {
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
    expect(decision.reasons).toContain("Trade exceeds maximum risk per trade.");
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
    expect(decision.reasons).toContain("Buy stop-loss must be below entry price.");
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
    expect(decision.reasons).toEqual(
      expect.arrayContaining([
        "Trading is stopped by risk controls.",
        "Portfolio equity must be positive.",
        "Entry price must be positive.",
        "Every trade must include a positive stop-loss.",
        "Every trade must include a positive take-profit.",
        "Calculated position size must be greater than zero."
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
    expect(sell.reasons).toEqual(
      expect.arrayContaining([
        "Sell stop-loss must be above entry price.",
        "Sell take-profit must be below entry price."
      ])
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
    expect(constrained.reasons).toEqual(
      expect.arrayContaining([
        "Trade exceeds maximum position size.",
        "Daily loss limit has been reached.",
        "Maximum drawdown limit has been reached.",
        "Cash balance is insufficient for the proposed buy order."
      ])
    );
  });
});
