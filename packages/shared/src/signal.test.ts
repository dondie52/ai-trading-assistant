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
  });
});

