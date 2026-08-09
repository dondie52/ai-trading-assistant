import { describe, expect, it } from "vitest";
import {
  GOLD_SEASONALITY_MONTHLY_BIAS_PERCENT,
  GOLD_TRADING_BRIEFING,
  buildGoldAwarePrompt,
  goldSeasonalityBiasPercent,
  isGoldSymbol
} from "./gold-playbook.js";

describe("isGoldSymbol", () => {
  it("recognizes gold ETFs and spot tickers", () => {
    expect(isGoldSymbol("GLD")).toBe(true);
    expect(isGoldSymbol("iau")).toBe(true);
    expect(isGoldSymbol("xauusd")).toBe(true);
    expect(isGoldSymbol(" XAU/USD ")).toBe(true);
  });

  it("is false for unrelated symbols", () => {
    expect(isGoldSymbol("AAPL")).toBe(false);
    expect(isGoldSymbol("SPY")).toBe(false);
  });
});

describe("buildGoldAwarePrompt", () => {
  it("appends the gold briefing for gold symbols", () => {
    const prompt = buildGoldAwarePrompt("Base prompt.", "GLD");
    expect(prompt).toBe(`Base prompt. ${GOLD_TRADING_BRIEFING}`);
  });

  it("leaves non-gold prompts untouched", () => {
    expect(buildGoldAwarePrompt("Base prompt.", "AAPL")).toBe("Base prompt.");
  });
});

describe("goldSeasonalityBiasPercent", () => {
  it("returns the historical average for the calendar month, Jan-indexed at 0", () => {
    expect(goldSeasonalityBiasPercent(new Date("2024-01-15T00:00:00Z"))).toBe(
      GOLD_SEASONALITY_MONTHLY_BIAS_PERCENT[0]
    );
    expect(goldSeasonalityBiasPercent(new Date("2024-09-15T00:00:00Z"))).toBe(
      GOLD_SEASONALITY_MONTHLY_BIAS_PERCENT[8]
    );
    expect(goldSeasonalityBiasPercent(new Date("2024-12-15T00:00:00Z"))).toBe(
      GOLD_SEASONALITY_MONTHLY_BIAS_PERCENT[11]
    );
  });

  it("has twelve months of data", () => {
    expect(GOLD_SEASONALITY_MONTHLY_BIAS_PERCENT).toHaveLength(12);
  });
});
