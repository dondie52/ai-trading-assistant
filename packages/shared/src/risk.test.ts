import { describe, expect, it } from "vitest";
import type { RiskRules } from "@trading/types";
import {
  calculatePositionSize,
  estimateNetEdgeBps,
  estimateRoundTripCostBps,
  validateTradeRisk
} from "./risk.js";

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

describe("portfolio-level risk controls", () => {
  const baseContext = {
    equity: 10_000,
    cashBalance: 10_000,
    dailyRealizedPnl: 0,
    currentDrawdownPercent: 0,
    existingPositionValue: 0
  };
  const baseIntent = {
    symbol: "AAPL",
    side: "BUY" as const,
    price: 100,
    stopLoss: 95,
    takeProfit: 110,
    requestedQuantity: 10
  };

  it("blocks a new symbol once the concurrent-position cap is reached", () => {
    const decision = validateTradeRisk(
      { ...rules, maxConcurrentPositions: 3 },
      { ...baseContext, openPositionCount: 3 },
      baseIntent
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejections?.map((item) => item.code)).toContain("MAX_CONCURRENT_POSITIONS");
  });

  it("still allows exiting when the concurrent-position cap is reached", () => {
    const decision = validateTradeRisk(
      { ...rules, maxConcurrentPositions: 3 },
      {
        ...baseContext,
        openPositionCount: 3,
        existingPositionQuantity: 10,
        existingPositionValue: 1_000
      },
      { ...baseIntent, side: "SELL", stopLoss: 105, takeProfit: 90 }
    );

    expect(decision.rejections?.map((item) => item.code)).not.toContain("MAX_CONCURRENT_POSITIONS");
  });

  it("halts new exposure after the consecutive-loss circuit breaker trips", () => {
    const decision = validateTradeRisk(
      { ...rules, maxConsecutiveLosses: 3 },
      { ...baseContext, consecutiveLosses: 3 },
      baseIntent
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejections?.map((item) => item.code)).toContain("CONSECUTIVE_LOSS_LOCK");
  });

  it("halts new exposure once the rolling weekly loss ceiling is hit", () => {
    const decision = validateTradeRisk(
      { ...rules, maxWeeklyLossPercent: 5 },
      { ...baseContext, weeklyRealizedPnl: -600 },
      baseIntent
    );

    expect(decision.approved).toBe(false);
    const weekly = decision.rejections?.find((item) => item.code === "WEEKLY_LOSS_LIMIT_REACHED");
    expect(weekly?.limit).toBe(500);
  });

  it("refuses to add to a losing long position", () => {
    const decision = validateTradeRisk(
      rules,
      {
        ...baseContext,
        existingPositionQuantity: 10,
        existingPositionValue: 1_100,
        existingAveragePrice: 110
      },
      { ...baseIntent, requestedQuantity: 5 }
    );

    expect(decision.approved).toBe(false);
    expect(decision.rejections?.map((item) => item.code)).toContain("AVERAGING_DOWN_BLOCKED");
  });

  it("allows adding to a winning long position", () => {
    const decision = validateTradeRisk(
      rules,
      {
        ...baseContext,
        existingPositionQuantity: 10,
        existingPositionValue: 900,
        existingAveragePrice: 90
      },
      { ...baseIntent, requestedQuantity: 5 }
    );

    expect(decision.rejections?.map((item) => item.code)).not.toContain("AVERAGING_DOWN_BLOCKED");
  });

  it("keeps legacy accounts working when the new rules are unset", () => {
    const decision = validateTradeRisk(rules, baseContext, baseIntent);
    expect(decision.approved).toBe(true);
  });
});

describe("trade cost efficiency", () => {
  it("charges slippage on both the entry and exit fill", () => {
    expect(estimateRoundTripCostBps(10_000, { feePerTrade: 0, slippagePercent: 0.05 })).toBe(10);
  });

  it("folds a flat per-trade fee into basis points using notional size", () => {
    // $1 fee each way on a $1,000 order = 2 * (1 / 1000) * 10,000 = 20 bps, plus 10 bps slippage.
    expect(estimateRoundTripCostBps(1_000, { feePerTrade: 1, slippagePercent: 0.05 })).toBe(30);
  });

  it("treats an unsized order as costless rather than dividing by zero", () => {
    expect(estimateRoundTripCostBps(0, { feePerTrade: 1, slippagePercent: 0.05 })).toBe(0);
  });

  it("nets the expected move against round-trip costs", () => {
    const netEdge = estimateNetEdgeBps(300, 10_000, { feePerTrade: 0, slippagePercent: 0.05 });
    expect(netEdge).toBe(290);
  });

  it("can go negative when costs outweigh the expected move", () => {
    const netEdge = estimateNetEdgeBps(5, 10_000, { feePerTrade: 0, slippagePercent: 0.05 });
    expect(netEdge).toBe(-5);
  });
});
