import { describe, expect, it } from "vitest";
import type { MarketCandle } from "@trading/types";
import { runHistoricalBacktest, runWalkForwardBacktest } from "./backtest.js";

const makeCandles = (closes: readonly number[]): readonly MarketCandle[] =>
  closes.map((close, index) => ({
    symbol: "AAPL",
    timeframe: "1h",
    timestamp: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    open: close - 0.25,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000_000 + index * 1000
  }));

describe("historical backtesting", () => {
  it("replays historical candles with fees, slippage, and performance metrics", () => {
    const candles = makeCandles([
      100, 99, 98, 97, 96, 95, 96, 97, 98, 99,
      101, 103, 105, 107, 109, 111, 113, 115, 114, 113,
      112, 111, 110, 108, 106, 104, 102, 100, 99, 98,
      97, 96
    ]);

    const result = runHistoricalBacktest(candles, {
      symbol: "aapl",
      timeframe: "1h",
      startingEquity: 50_000,
      fastPeriod: 3,
      slowPeriod: 6,
      maxPositionPercent: 25,
      feePerTrade: 1,
      slippagePercent: 0.1
    });

    expect(result.symbol).toBe("AAPL");
    expect(result.timeframe).toBe("1h");
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.fees).toBeGreaterThan(0);
    expect(result.trades[0]?.slippage).toBeGreaterThan(0);
    expect(result.performance.equityCurve.length).toBe(result.totalTrades + 1);
  });

  it("detects corrupted market candles before simulation", () => {
    const candles = makeCandles([100, 101, 102, 103, 104, 105, 106, 107]);
    const first = candles[0];
    if (!first) {
      throw new Error("Expected fixture candle.");
    }
    const corrupted: readonly MarketCandle[] = [{ ...first, high: 95, low: 100 }, ...candles.slice(1)];

    expect(() =>
      runHistoricalBacktest(corrupted, {
        symbol: "AAPL",
        fastPeriod: 2,
        slowPeriod: 4
      })
    ).toThrow(/corrupted market data/);
  });

  it("selects parameters on training windows and reports out-of-sample walk-forward results", () => {
    const candles = makeCandles(
      Array.from({ length: 140 }, (_, index) =>
        Number((100 + index * 0.08 + Math.sin(index / 4) * 4).toFixed(4))
      )
    );
    const result = runWalkForwardBacktest(candles, {
      symbol: "aapl",
      timeframe: "1h",
      startingEquity: 50_000,
      trainSize: 60,
      testSize: 30,
      candidates: [
        { fastPeriod: 3, slowPeriod: 8 },
        { fastPeriod: 5, slowPeriod: 12 }
      ],
      maxPositionPercent: 20,
      feePerTrade: 1,
      slippagePercent: 0.05
    });

    expect(result.symbol).toBe("AAPL");
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0]).toMatchObject({
      index: 0,
      testingStart: candles[60]?.timestamp
    });
    expect(result.windows.every((window) => window.result.trades.every(
      (trade) => trade.closedAt >= window.testingStart
    ))).toBe(true);
    expect(result.performance.equityCurve.length).toBe(result.totalTrades + 1);
  });

  it("rejects incomplete walk-forward configurations", () => {
    const candles = makeCandles(Array.from({ length: 20 }, (_, index) => 100 + index));
    expect(() =>
      runWalkForwardBacktest(candles, {
        symbol: "AAPL",
        trainSize: 15,
        testSize: 10
      })
    ).toThrow(/one full train\/test window/);
  });
});
