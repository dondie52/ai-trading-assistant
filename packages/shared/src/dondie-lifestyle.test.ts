import { describe, expect, it } from "vitest";
import type { DondieAgent, Trade } from "@trading/types";
import {
  buildDondieLifestyleWorld,
  resolveDondieActivity,
  resolveLifestyleLevel,
  resolveNextUnlock
} from "./dondie-lifestyle.js";

const agent: DondieAgent = {
  id: "agent-1",
  userId: "user-1",
  name: "Dondie",
  tier: "FREE",
  status: "ACTIVE",
  walletBalance: 30,
  scheduleMinutes: 60,
  symbolUniverse: ["AAPL"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const trade = (pnl: number, closedAt: string): Trade => ({
  id: `trade-${closedAt}`,
  orderId: "order-1",
  userId: "user-1",
  symbol: "AAPL",
  side: "BUY",
  quantity: 1,
  entryPrice: 100,
  exitPrice: 100 + pnl,
  pnl,
  openedAt: closedAt,
  closedAt
});

describe("dondie lifestyle progression", () => {
  it("maps wallet balances onto lifestyle levels", () => {
    expect(resolveLifestyleLevel(0)).toBe(1);
    expect(resolveLifestyleLevel(24.99)).toBe(1);
    expect(resolveLifestyleLevel(25)).toBe(2);
    expect(resolveLifestyleLevel(100)).toBe(3);
    expect(resolveLifestyleLevel(250)).toBe(4);
    expect(resolveLifestyleLevel(500)).toBe(5);
  });

  it("computes next unlock progress", () => {
    const next = resolveNextUnlock(50, 2);
    expect(next.level).toBe(3);
    expect(next.walletRequired).toBe(100);
    expect(next.progressPercent).toBeGreaterThan(0);
    expect(next.progressPercent).toBeLessThan(100);
  });

  it("prefers risk lock and broker disconnect over idle work states", () => {
    expect(
      resolveDondieActivity({
        agent,
        riskLocked: true,
        brokerConnected: true,
        marketOpen: true,
        automationPaused: false
      }).activity
    ).toBe("BLOCKED_BY_RISK");

    expect(
      resolveDondieActivity({
        agent,
        riskLocked: false,
        brokerConnected: false,
        marketOpen: true,
        automationPaused: false
      }).activity
    ).toBe("BROKER_DISCONNECTED");
  });

  it("shows weekend crypto desk hustle when equities are closed", () => {
    const activity = resolveDondieActivity({
      agent,
      riskLocked: false,
      brokerConnected: true,
      marketOpen: false,
      automationPaused: false,
      weekendSideHustle: true
    });
    expect(activity.activity).toBe("SIDE_HUSTLE");
    expect(activity.currentTask.toLowerCase()).toContain("btcusd");
  });

  it("builds a world snapshot with achievements and room tiers", () => {
    const world = buildDondieLifestyleWorld({
      agent: { ...agent, walletBalance: 120, tier: "STANDARD" },
      trades: [trade(12, "2026-01-02T00:00:00.000Z"), trade(5, "2026-01-03T00:00:00.000Z")],
      orders: [],
      completedRuns: 12,
      brokerConnected: true,
      riskLocked: false,
      automationPaused: false,
      marketOpen: true,
      recentSignalSymbol: "AAPL",
      hasOpenPositions: false,
      paperMode: true
    });

    expect(world.lifestyleLevel).toBe(3);
    expect(world.activity).toBe("ANALYSING");
    expect(world.currentTask).toContain("AAPL");
    expect(world.room.monitor).toBeGreaterThanOrEqual(3);
    expect(world.achievements.some((item) => item.id === "first-profit" && item.unlocked)).toBe(true);
    expect(world.achievements.some((item) => item.id === "ten-runs" && item.unlocked)).toBe(true);
    expect(world.disclaimer.toLowerCase()).toContain("not a promise");
    expect(world.paperTradingLabel).toBe("PAPER");
  });
});
