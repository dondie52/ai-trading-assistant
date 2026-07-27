import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("DondieScheduler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ticks immediately on start and again on interval, swallowing per-user failures", async () => {
    process.env.DONDIE_SCHEDULER_ENABLED = "true";
    process.env.DONDIE_SCHEDULE_MINUTES = "1";
    const { DondieScheduler } = await import("../src/dondie/dondie.scheduler.js");
    const { dondieConfig } = await import("../src/dondie/dondie.config.js");

    const scheduler = new DondieScheduler();
    const runForUser = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    const listUserIds = vi.fn().mockReturnValue(["user-1", "user-2"]);

    scheduler.start(runForUser, listUserIds);
    expect(dondieConfig.schedulerEnabled).toBe(true);

    // Boot catch-up must not wait a full interval.
    await vi.advanceTimersByTimeAsync(0);
    expect(listUserIds).toHaveBeenCalled();
    expect(runForUser).toHaveBeenCalledWith("user-1");
    expect(runForUser).toHaveBeenCalledWith("user-2");

    runForUser.mockClear();
    listUserIds.mockClear();
    await vi.advanceTimersByTimeAsync(Math.max(60_000, dondieConfig.defaultScheduleMinutes * 60_000));
    expect(listUserIds).toHaveBeenCalled();
    expect(runForUser).toHaveBeenCalledWith("user-1");
    expect(runForUser).toHaveBeenCalledWith("user-2");

    scheduler.onModuleDestroy();
  });

  it("exposes tickNow for external cron wakeups", async () => {
    process.env.DONDIE_SCHEDULER_ENABLED = "true";
    process.env.DONDIE_SCHEDULE_MINUTES = "60";
    const { DondieScheduler } = await import("../src/dondie/dondie.scheduler.js");

    const scheduler = new DondieScheduler();
    const runForUser = vi.fn().mockResolvedValue(undefined);
    scheduler.start(runForUser, () => ["user-cron"]);
    await vi.advanceTimersByTimeAsync(0);
    runForUser.mockClear();

    const result = await scheduler.tickNow();
    expect(result).toEqual({ attempted: 1, succeeded: 1, failed: 0, triggerType: "API_REQUEST" });
    expect(runForUser).toHaveBeenCalledWith("user-cron");
    scheduler.onModuleDestroy();
  });

  it("does not start when scheduler is disabled", async () => {
    process.env.DONDIE_SCHEDULER_ENABLED = "false";
    const { DondieScheduler } = await import("../src/dondie/dondie.scheduler.js");
    const scheduler = new DondieScheduler();
    const runForUser = vi.fn();
    scheduler.start(runForUser, () => ["user-1"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runForUser).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });
});
