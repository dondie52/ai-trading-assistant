import { describe, expect, it } from "vitest";
import { generateHistoricalPrices } from "./indicators.js";
import { generateSignal } from "./signal.js";

describe("signal generation", () => {
  it("generates a bounded signal with model metadata", () => {
    const candles = generateHistoricalPrices("AAPL");
    const signal = generateSignal("aapl", candles, "unit-test-model");

    expect(["BUY", "SELL", "HOLD"]).toContain(signal.signalType);
    expect(signal.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(signal.confidenceScore).toBeLessThanOrEqual(100);
    expect(signal.modelVersion).toBe("unit-test-model");
    expect(signal.features.latestClose).toBeTypeOf("number");
    expect(signal.features.goldAware).toBe(false);
  });

  it("applies gold-aware tuning for gold symbols", () => {
    const candles = generateHistoricalPrices("GLD");
    const goldSignal = generateSignal("GLD", candles, "unit-test-model");
    const equitySignal = generateSignal("AAPL", candles, "unit-test-model");

    expect(goldSignal.features.goldAware).toBe(true);
    // Same candles, different symbol — gold's heavier trend weighting must move confidence.
    expect(goldSignal.confidenceScore).not.toBe(equitySignal.confidenceScore);
  });

  it("recognizes gold aliases case-insensitively", () => {
    const candles = generateHistoricalPrices("XAUUSD");
    const signal = generateSignal("xauusd", candles, "unit-test-model");
    expect(signal.features.goldAware).toBe(true);
  });

  it("tilts gold confidence by calendar-month seasonality", () => {
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

