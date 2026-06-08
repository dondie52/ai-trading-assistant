import { describe, expect, it } from "vitest";
import { atr, calculateIndicators, generateHistoricalPrices, volumeSnapshot } from "./indicators.js";

describe("market indicators", () => {
  it("calculates ATR and volume indicators from candles", () => {
    const candles = generateHistoricalPrices("AAPL", 40, 185, "15m");
    const indicators = calculateIndicators(candles);

    expect(indicators.atr).toBeTypeOf("number");
    expect(indicators.volume.latest).toBeGreaterThan(0);
    expect(indicators.volume.sma).toBeGreaterThan(0);
    expect(indicators.volume.changePercent).toBeTypeOf("number");
    expect(atr(candles)).toBe(indicators.atr);
    expect(volumeSnapshot(candles)).toEqual(indicators.volume);
  });

  it("generates candles for the requested timeframe", () => {
    const candles = generateHistoricalPrices("MSFT", 3, 410, "1h");
    const first = candles[0];
    const second = candles[1];

    expect(first?.timeframe).toBe("1h");
    expect(second?.timeframe).toBe("1h");
    expect(Date.parse(second?.timestamp ?? "") - Date.parse(first?.timestamp ?? "")).toBe(60 * 60_000);
  });
});
