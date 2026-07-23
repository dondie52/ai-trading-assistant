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

  it("ticks scheduled users and swallows per-user failures", async () => {
    process.env.DONDIE_SCHEDULER_ENABLED = "true";
    process.env.DONDIE_SCHEDULE_MINUTES = "1";
    const { DondieScheduler } = await import("../src/dondie/dondie.scheduler.js");
    const { dondieConfig } = await import("../src/dondie/dondie.config.js");

    const scheduler = new DondieScheduler();
    const runForUser = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"));
    const listUserIds = vi.fn().mockReturnValue(["user-1", "user-2"]);

    scheduler.start(runForUser, listUserIds);
    expect(dondieConfig.schedulerEnabled).toBe(true);

    await vi.advanceTimersByTimeAsync(Math.max(60_000, dondieConfig.defaultScheduleMinutes * 60_000));
    expect(listUserIds).toHaveBeenCalled();
    expect(runForUser).toHaveBeenCalledWith("user-1");
    expect(runForUser).toHaveBeenCalledWith("user-2");

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
