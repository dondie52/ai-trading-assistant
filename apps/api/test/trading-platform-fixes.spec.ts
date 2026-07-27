import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { DondieScheduler } from "../src/dondie/dondie.scheduler.js";
import { SchedulerStatusService, TradeActivityService } from "../src/dondie/trade-activity.service.js";
import { PlatformStore } from "../src/store/platform.store.js";
import { aggregatePositionsBySymbol, buildPortfolioAccounting, classifySkipReason } from "@trading/shared";

describe("durable scheduler guarantees", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env.DONDIE_SCHEDULER_ENABLED = "true";
    process.env.DONDIE_SCHEDULE_MINUTES = "1";
    process.env.ALPACA_ENVIRONMENT = "PAPER";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs scheduled scans without a browser session (in-process timer)", async () => {
    const status = new SchedulerStatusService();
    const scheduler = new DondieScheduler(status);
    const runForUser = vi.fn().mockResolvedValue(undefined);
    scheduler.start(runForUser, () => ["user-1"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(runForUser).toHaveBeenCalledWith("user-1");
    expect(status.getStatus().tradingEnvironment).toBe("PAPER");
    scheduler.onModuleDestroy();
  });

  it("closing the frontend does not clear the scheduler status worker", () => {
    const status = new SchedulerStatusService();
    status.heartbeat(new Date(Date.now() + 60_000).toISOString());
    // No browser involvement — status remains available server-side.
    expect(status.getStatus().workerId.length).toBeGreaterThan(0);
    expect(["RUNNING", "DELAYED", "STOPPED"]).toContain(status.getStatus().status);
  });

  it("marks force-scan trigger type as MANUAL_FORCE_SCAN on activity", () => {
    const store = new PlatformStore();
    const activities = new TradeActivityService(store);
    const activity = activities.record({
      userId: randomUUID(),
      stage: "SCAN_STARTED",
      triggerType: "MANUAL_FORCE_SCAN",
      source: "manual"
    });
    expect(activity.triggerType).toBe("MANUAL_FORCE_SCAN");
    expect(activity.headline.toLowerCase()).toContain("manual");
  });

  it("prevents overlapping scheduled and manual scans via distributed lock", () => {
    const status = new SchedulerStatusService();
    expect(status.tryAcquireScanLock("scheduled")).toBe(true);
    expect(status.tryAcquireScanLock("manual")).toBe(false);
    status.releaseScanLock("scheduled");
    expect(status.tryAcquireScanLock("manual")).toBe(true);
  });

  it("prevents two workers from submitting the same order intent twice", () => {
    const status = new SchedulerStatusService();
    expect(status.claimOrderIntent("user:SPY:signal-1")).toBe(true);
    expect(status.claimOrderIntent("user:SPY:signal-1")).toBe(false);
  });

  it("processes a repeated broker fill event once", () => {
    const status = new SchedulerStatusService();
    expect(status.claimFillEvent("broker-fill-1")).toBe(true);
    expect(status.claimFillEvent("broker-fill-1")).toBe(false);
  });

  it("exposes next scheduled scan and warns when inactive", () => {
    const status = new SchedulerStatusService();
    const next = new Date(Date.now() + 15 * 60_000).toISOString();
    status.recordScanResult({
      triggerType: "SCHEDULED",
      durationMs: 12,
      result: "OK",
      nextExpectedScanAt: next
    });
    expect(status.getStatus().nextExpectedScanAt).toBe(next);
    expect(status.getStatus().lastScheduledScanAt).toBeTruthy();
  });
});

describe("accounting + positions regressions", () => {
  it("buying 9.75 does not create 9.75 realized pnl", () => {
    const snap = buildPortfolioAccounting({
      cash: 0.25,
      equity: 10,
      positions: [{ quantity: 1, averagePrice: 9.75, costBasis: 9.75, unrealizedPnl: -0.0019 }],
      realizedPnlFromClosedTrades: 0
    });
    expect(snap.realizedPnl).toBe(0);
    expect(snap.capitalDeployed).toBeCloseTo(9.75, 2);
  });

  it("unrealized pnl reflects two open broker positions", () => {
    const snap = buildPortfolioAccounting({
      cash: 0.25,
      equity: 9.9981,
      positions: [
        { quantity: 0.04, averagePrice: 100, unrealizedPnl: -0.001 },
        { quantity: 0.001, averagePrice: 700, unrealizedPnl: -0.0009 }
      ],
      realizedPnlFromClosedTrades: 0
    });
    expect(snap.unrealizedPnl).toBeCloseTo(-0.0019, 4);
  });

  it("one NVDA and one SPY broker position render as exactly two rows", () => {
    const rows = aggregatePositionsBySymbol([
      { id: "1", symbol: "NVDA", quantity: 0.0433, averagePrice: 180, unrealizedPnl: -0.001 },
      { id: "2", symbol: "SPY", quantity: 0.001, averagePrice: 700, unrealizedPnl: -0.0005 },
      { id: "3", symbol: "SPY", quantity: 0.0007, averagePrice: 710, unrealizedPnl: -0.0004 }
    ] as const);
    expect(rows).toHaveLength(2);
  });

  it("QQQ skip history includes a specific reason code", () => {
    expect(classifySkipReason("Order value exceeds available cash $0.25")).toBe(
      "INSUFFICIENT_BUYING_POWER"
    );
  });
});

describe("trade activity persistence for UI refresh", () => {
  it("keeps scan activity visible via audit-backed listing", () => {
    const store = new PlatformStore();
    const activities = new TradeActivityService(store);
    const userId = randomUUID();
    activities.record({
      userId,
      stage: "SCAN_STARTED",
      triggerType: "SCHEDULED",
      source: "scheduled"
    });
    activities.record({
      userId,
      stage: "SIGNAL_SKIPPED",
      triggerType: "SCHEDULED",
      symbol: "QQQ",
      confidence: 92,
      reasonCode: "INSUFFICIENT_BUYING_POWER",
      reason: "available cash $0.25",
      source: "scheduled"
    });
    const listed = activities.listForUser(userId);
    expect(listed.some((row) => row.reasonCode === "INSUFFICIENT_BUYING_POWER")).toBe(true);
    expect(listed.some((row) => row.stage === "SCAN_STARTED")).toBe(true);
  });
});
