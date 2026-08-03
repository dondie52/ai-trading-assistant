import { describe, expect, it } from "vitest";
import {
  aggregatePositionsBySymbol,
  buildPortfolioAccounting,
  classifySkipReason,
  computeRealizedPnlFifo,
  countConsecutiveLosses,
  formatUsd,
  normalizeSignedZero,
  sumRealizedPnlSince
} from "@trading/shared";

describe("portfolio accounting", () => {
  it("does not treat buying $9.75 of securities as $9.75 realized profit", () => {
    const snapshot = buildPortfolioAccounting({
      cash: 0.25,
      equity: 9.9981,
      lastEquity: 10,
      positions: [
        {
          quantity: 0.0433,
          averagePrice: 180,
          costBasis: 7.794,
          marketValue: 7.793,
          unrealizedPnl: -0.001
        },
        {
          quantity: 0.0017,
          averagePrice: 1147,
          costBasis: 1.9499,
          marketValue: 1.949,
          unrealizedPnl: -0.0009
        }
      ],
      realizedPnlFromClosedTrades: 0
    });

    expect(snapshot.cash).toBeCloseTo(0.25, 4);
    expect(snapshot.capitalDeployed).toBeCloseTo(9.7439, 3);
    expect(snapshot.realizedPnl).toBe(0);
    expect(snapshot.unrealizedPnl).toBeCloseTo(-0.0019, 4);
    expect(snapshot.equity - snapshot.cash).not.toBe(snapshot.realizedPnl);
  });

  it("keeps realized P&L at zero while positions remain open", () => {
    const snapshot = buildPortfolioAccounting({
      cash: 0.25,
      equity: 10,
      positions: [{ quantity: 1, averagePrice: 9.75, costBasis: 9.75, unrealizedPnl: 0 }],
      realizedPnlFromClosedTrades: 0
    });
    expect(snapshot.realizedPnl).toBe(0);
    expect(snapshot.capitalDeployed).toBeCloseTo(9.75, 4);
  });

  it("updates realized P&L only from closed-fill totals", () => {
    const snapshot = buildPortfolioAccounting({
      cash: 10.5,
      equity: 10.5,
      positions: [],
      realizedPnlFromClosedTrades: 0.5
    });
    expect(snapshot.realizedPnl).toBe(0.5);
    expect(snapshot.capitalDeployed).toBe(0);
  });
});

describe("position aggregation", () => {
  it("renders one NVDA and one SPY row from duplicate local lots", () => {
    const rows = aggregatePositionsBySymbol([
      { symbol: "NVDA", quantity: 0.04, averagePrice: 100, unrealizedPnl: -0.001 },
      { symbol: "SPY", quantity: 0.001, averagePrice: 700, unrealizedPnl: -0.0005 },
      { symbol: "SPY", quantity: 0.0007, averagePrice: 710, unrealizedPnl: -0.0004 }
    ]);
    expect(rows.map((row) => row.symbol).sort()).toEqual(["NVDA", "SPY"]);
    expect(rows).toHaveLength(2);
    const spy = rows.find((row) => row.symbol === "SPY");
    expect(spy?.quantity).toBeCloseTo(0.0017, 6);
  });
});

describe("skip reason codes", () => {
  it("classifies insufficient buying power for QQQ-style skips", () => {
    expect(
      classifySkipReason("Order value $50.00 exceeds available cash $0.25.")
    ).toBe("INSUFFICIENT_BUYING_POWER");
    expect(classifySkipReason("Duplicate position — already long 1 SPY.")).toBe(
      "POSITION_ALREADY_OPEN"
    );
    expect(classifySkipReason("Signal confidence 50% was below threshold 65%")).toBe(
      "CONFIDENCE_TOO_LOW"
    );
  });
});

describe("micro money format", () => {
  it("does not display negative zero", () => {
    expect(formatUsd(-0.0004)).toBe("<$0.01 loss");
    expect(formatUsd(-0.0004, { microDetail: true })).toBe("-$0.0004");
    expect(formatUsd(-0)).toBe("$0.00");
    expect(normalizeSignedZero(-0)).toBe(0);
  });
});

describe("FIFO realized P&L from broker fills", () => {
  it("returns zero while a position is still open", () => {
    const summary = computeRealizedPnlFifo([
      { symbol: "SPY", side: "BUY", quantity: 2, price: 100, filledAt: "2026-01-02T15:00:00.000Z" }
    ]);

    expect(summary.total).toBe(0);
    expect(summary.lots).toHaveLength(0);
  });

  it("realizes P&L lot by lot in FIFO order", () => {
    const summary = computeRealizedPnlFifo([
      { symbol: "SPY", side: "BUY", quantity: 1, price: 100, filledAt: "2026-01-02T15:00:00.000Z" },
      { symbol: "SPY", side: "BUY", quantity: 1, price: 110, filledAt: "2026-01-03T15:00:00.000Z" },
      { symbol: "SPY", side: "SELL", quantity: 2, price: 120, filledAt: "2026-01-04T15:00:00.000Z" }
    ]);

    // 20 from the first lot + 10 from the second.
    expect(summary.total).toBe(30);
    expect(summary.lots).toHaveLength(2);
    expect(summary.lots[0]?.entryPrice).toBe(100);
    expect(summary.lots[1]?.entryPrice).toBe(110);
  });

  it("handles fractional micro-stake lots", () => {
    const summary = computeRealizedPnlFifo([
      { symbol: "NVDA", side: "BUY", quantity: 0.0433, price: 196.26, filledAt: "2026-01-02T15:00:00.000Z" },
      { symbol: "NVDA", side: "SELL", quantity: 0.0433, price: 199, filledAt: "2026-01-02T18:00:00.000Z" }
    ]);

    expect(summary.total).toBeCloseTo(0.1187, 3);
  });

  it("closes the old side before opening the new one when a fill crosses through flat", () => {
    const summary = computeRealizedPnlFifo([
      { symbol: "QQQ", side: "BUY", quantity: 1, price: 100, filledAt: "2026-01-02T15:00:00.000Z" },
      { symbol: "QQQ", side: "SELL", quantity: 3, price: 105, filledAt: "2026-01-03T15:00:00.000Z" },
      { symbol: "QQQ", side: "BUY", quantity: 2, price: 100, filledAt: "2026-01-04T15:00:00.000Z" }
    ]);

    // +5 closing the long, then +10 closing the 2-share short at 105 -> 100.
    expect(summary.total).toBe(15);
  });

  it("keeps symbols independent", () => {
    const summary = computeRealizedPnlFifo([
      { symbol: "SPY", side: "BUY", quantity: 1, price: 100, filledAt: "2026-01-02T15:00:00.000Z" },
      { symbol: "QQQ", side: "SELL", quantity: 1, price: 200, filledAt: "2026-01-02T16:00:00.000Z" }
    ]);

    expect(summary.total).toBe(0);
    expect(summary.lots).toHaveLength(0);
  });

  it("windows realized P&L by close time", () => {
    const summary = computeRealizedPnlFifo([
      { symbol: "SPY", side: "BUY", quantity: 1, price: 100, filledAt: "2026-01-01T15:00:00.000Z" },
      { symbol: "SPY", side: "SELL", quantity: 1, price: 90, filledAt: "2026-01-02T15:00:00.000Z" },
      { symbol: "SPY", side: "BUY", quantity: 1, price: 100, filledAt: "2026-01-09T15:00:00.000Z" },
      { symbol: "SPY", side: "SELL", quantity: 1, price: 105, filledAt: "2026-01-10T15:00:00.000Z" }
    ]);

    expect(summary.total).toBe(-5);
    expect(sumRealizedPnlSince(summary.lots, "2026-01-09T00:00:00.000Z")).toBe(5);
  });

  it("counts the losing streak back to the last winner", () => {
    expect(countConsecutiveLosses([{ pnl: 5 }, { pnl: -1 }, { pnl: -2 }])).toBe(2);
    expect(countConsecutiveLosses([{ pnl: -1 }, { pnl: 4 }])).toBe(0);
    expect(countConsecutiveLosses([])).toBe(0);
  });
});
