import type { MarketCandle } from "@trading/types";
import { describe, expect, it } from "vitest";
import { generateHistoricalPrices } from "./indicators.js";
import { generateSignal } from "./signal.js";

const flatCandles = (count: number, price = 100, volume = 1_000_000): readonly MarketCandle[] =>
  Array.from({ length: count }, (_, index) => ({
    symbol: "FLAT",
    timeframe: "1m" as const,
    timestamp: new Date(Date.now() - (count - index) * 60_000).toISOString(),
    open: price,
    high: price + 0.1,
    low: price - 0.1,
    close: price,
    volume
  }));

describe("signal generation (trend-breakout technique)", () => {
  it("generates a bounded signal with model metadata and breakout features", () => {
    const candles = generateHistoricalPrices("AAPL");
    const signal = generateSignal("aapl", candles, "unit-test-model");

    expect(["BUY", "SELL", "HOLD"]).toContain(signal.signalType);
    expect(signal.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(signal.confidenceScore).toBeLessThanOrEqual(100);
    expect(signal.modelVersion).toBe("unit-test-model");
    expect(signal.features.technique).toBe("trend-breakout");
    expect(signal.features.latestClose).toBeTypeOf("number");
    expect(signal.features.breakoutLookback).toBe(20);
    expect(signal.features.goldAware).toBe(false);
  });

  it("only fires BUY/SELL when a breakout, the trend, and volume all agree", () => {
    const candles = generateHistoricalPrices("AAPL");
    const signal = generateSignal("AAPL", candles);

    if (signal.signalType === "BUY") {
      expect(signal.features.breakoutDirection).toBe("UP");
      expect(signal.features.aboveTrend).toBe(true);
      expect(signal.features.volumeConfirmed).toBe(true);
    } else if (signal.signalType === "SELL") {
      expect(signal.features.breakoutDirection).toBe("DOWN");
      expect(signal.features.aboveTrend).toBe(false);
      expect(signal.features.volumeConfirmed).toBe(true);
    } else {
      expect(signal.features.breakoutDirection).toBeNull();
    }
  });

  it("holds when price is range-bound with no breakout", () => {
    const candles = flatCandles(40);
    const signal = generateSignal("FLAT", candles);

    expect(signal.signalType).toBe("HOLD");
    expect(signal.features.breakoutDirection).toBeNull();
  });

  it("uses a wider breakout lookback for gold symbols", () => {
    const candles = generateHistoricalPrices("GLD");
    const goldSignal = generateSignal("GLD", candles, "unit-test-model");

    expect(goldSignal.features.goldAware).toBe(true);
    expect(goldSignal.features.breakoutLookback).toBe(30);
  });

  it("recognizes gold aliases case-insensitively", () => {
    const candles = generateHistoricalPrices("XAUUSD");
    const signal = generateSignal("xauusd", candles, "unit-test-model");
    expect(signal.features.goldAware).toBe(true);
  });

  it("tilts gold confidence by calendar-month seasonality when a signal fires", () => {
    const candles = generateHistoricalPrices("GLD");
    // September has a historically strong average gold return (+2.0%); June a weak one (-1.0%).
    const strongMonth = generateSignal("GLD", candles, "unit-test-model", new Date("2024-09-15T12:00:00Z"));
    const weakMonth = generateSignal("GLD", candles, "unit-test-model", new Date("2024-06-15T12:00:00Z"));

    expect(strongMonth.features.seasonalBiasPercent).toBe(2.0);
    expect(weakMonth.features.seasonalBiasPercent).toBe(-1.0);
    if (strongMonth.signalType !== "HOLD" && weakMonth.signalType === strongMonth.signalType) {
      expect(strongMonth.confidenceScore).not.toBe(weakMonth.confidenceScore);
    }
  });

  it("does not seasonally tilt non-gold symbols", () => {
    const candles = generateHistoricalPrices("AAPL");
    const signal = generateSignal("AAPL", candles, "unit-test-model", new Date("2024-09-15T12:00:00Z"));
    expect(signal.features.seasonalBiasPercent).toBeNull();
    expect(signal.features.seasonalTilt).toBe(0);
  });
});
