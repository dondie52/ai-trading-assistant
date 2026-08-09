import { describe, expect, it } from "vitest";
import type { MarketCandle } from "@trading/types";
import { runHistoricalBacktest, runSignalBacktest, runWalkForwardBacktest } from "./backtest.js";
import { generateHistoricalPrices } from "./indicators.js";

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

describe("signal backtesting", () => {
  it("replays generateSignal decisions without lookahead", () => {
    const candles = generateHistoricalPrices("GLD", 150, 185, "1h");

    const result = runSignalBacktest(candles, {
      symbol: "gld",
      timeframe: "1h",
      startingEquity: 50_000,
      warmupBars: 60,
      maxPositionPercent: 20,
      feePerTrade: 1,
      slippagePercent: 0.05
    });

    expect(result.symbol).toBe("GLD");
    expect(result.timeframe).toBe("1h");
    expect(result.performance.equityCurve.length).toBe(result.totalTrades + 1);
    // No trade can be decided before the warmup window has filled.
    const firstTrade = result.trades[0];
    if (firstTrade) {
      expect(firstTrade.openedAt >= candles[60]!.timestamp).toBe(true);
    }
  });

  it("only acts on signals meeting the confidence threshold", () => {
    const candles = generateHistoricalPrices("AAPL", 150, 185, "1h");

    const permissive = runSignalBacktest(candles, { symbol: "AAPL", confidenceThreshold: 0 });
    const strict = runSignalBacktest(candles, { symbol: "AAPL", confidenceThreshold: 100 });

    expect(strict.totalTrades).toBeLessThanOrEqual(permissive.totalTrades);
  });

  it("rejects too few candles for the warmup window", () => {
    const candles = generateHistoricalPrices("AAPL", 40, 185, "1h");
    expect(() => runSignalBacktest(candles, { symbol: "AAPL", warmupBars: 60 })).toThrow(
      /warmupBars \+ 2 candles/
    );
  });

  it("rejects invalid numeric settings", () => {
    const candles = generateHistoricalPrices("AAPL", 100, 185, "1h");
    expect(() => runSignalBacktest(candles, { symbol: "AAPL", confidenceThreshold: 150 })).toThrow(
      /invalid/
    );
  });
});
