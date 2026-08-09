import { describe, expect, it } from "vitest";
import { GOLD_TRADING_BRIEFING, buildGoldAwarePrompt, isGoldSymbol } from "./gold-playbook.js";

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
