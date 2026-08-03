import { describe, expect, it, vi } from "vitest";
import { SchedulerStatusService } from "../src/dondie/trade-activity.service.js";
import { HealthController } from "../src/health/health.controller.js";
import type { PlatformService } from "../src/platform.service.js";
import type { OrderReconciliationService } from "../src/trading/order-reconciliation.service.js";

const stubReconciliation = (
  status: ReturnType<OrderReconciliationService["getStatus"]> = { enabled: true }
): OrderReconciliationService =>
  ({ getStatus: vi.fn().mockReturnValue(status) }) as unknown as OrderReconciliationService;

describe("HealthController", () => {
  it("serves a DB-free liveness payload for Render probes", () => {
    const platform = {
      getSystemHealth: vi.fn()
    } as unknown as PlatformService;
    const controller = new HealthController(platform, new SchedulerStatusService(), stubReconciliation());

    const response = controller.get();

    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({ api: "ok" });
    expect(platform.getSystemHealth).not.toHaveBeenCalled();
  });

  it("delegates readiness to the detailed system health check", async () => {
    const platform = {
      getSystemHealth: vi.fn().mockResolvedValue({
        api: "ok",
        supabase: { status: "ok" }
      })
    } as unknown as PlatformService;
    const controller = new HealthController(platform, new SchedulerStatusService(), stubReconciliation());

    const response = await controller.ready();

    expect(platform.getSystemHealth).toHaveBeenCalledTimes(1);
    expect(response.data).toMatchObject({ api: "ok", supabase: { status: "ok" } });
  });

  it("reports worker health without touching the database", () => {
    const platform = { getSystemHealth: vi.fn() } as unknown as PlatformService;
    const scheduler = new SchedulerStatusService();
    scheduler.heartbeat(new Date(Date.now() + 60_000).toISOString());
    const reconciliation = stubReconciliation({
      enabled: true,
      lastRunAt: new Date().toISOString(),
      lastResult: { checked: 2, updated: 1, abandoned: 0, errors: [] }
    });
    const controller = new HealthController(platform, scheduler, reconciliation);

    const response = controller.workers();

    expect(platform.getSystemHealth).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({
      reconciliation: { enabled: true, lastResult: { updated: 1 } }
    });
    expect((response.data as { scheduler: { workerId: string } }).scheduler.workerId.length).toBeGreaterThan(0);
  });
});
