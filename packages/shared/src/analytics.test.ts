import { describe, expect, it } from "vitest";
import type { Trade } from "@trading/types";
import {
  calculateMaxDrawdown,
  calculateAverageTrade,
  calculateProfitFactor,
  calculateRiskRewardRatio,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateWinRate,
  summarizePerformance
} from "./analytics.js";

const trade = (pnl: number): Pick<Trade, "pnl"> => ({ pnl });

describe("analytics calculations", () => {
  it("calculates win rate", () => {
    expect(calculateWinRate([trade(12), trade(-4), trade(7)])).toBe(66.67);
  });

  it("calculates profit factor", () => {
    expect(calculateProfitFactor([trade(12), trade(-4), trade(8)])).toBe(5);
  });

  it("calculates maximum drawdown from an equity curve", () => {
    expect(calculateMaxDrawdown([10_000, 10_500, 9_900, 10_200])).toBe(5.71);
  });

  it("calculates a non-zero sharpe ratio for variable returns", () => {
    expect(calculateSharpeRatio([0.01, -0.005, 0.008, 0.002])).not.toBe(0);
  });

  it("calculates downside-adjusted and per-trade performance metrics", () => {
    expect(calculateSortinoRatio([0.01, -0.005, 0.008, 0.002])).not.toBe(0);
    expect(calculateAverageTrade([trade(12), trade(-4), trade(7)])).toBe(5);
    expect(calculateRiskRewardRatio([trade(12), trade(-4), trade(8)])).toBe(2.5);
  });

  it("summarizes performance with an equity curve", () => {
    const summary = summarizePerformance(10_000, [trade(50), trade(-20), trade(30)]);
    expect(summary.equityCurve).toEqual([10_000, 10_050, 10_030, 10_060]);
    expect(summary.totalReturn).toBe(0.6);
    expect(summary.averageTrade).toBe(20);
    expect(summary.riskRewardRatio).toBe(2);
  });
});
