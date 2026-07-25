import { describe, expect, it, vi } from "vitest";
import { HealthController } from "../src/health/health.controller.js";
import type { PlatformService } from "../src/platform.service.js";

describe("HealthController", () => {
  it("serves a DB-free liveness payload for Render probes", () => {
    const platform = {
      getSystemHealth: vi.fn()
    } as unknown as PlatformService;
    const controller = new HealthController(platform);

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
    const controller = new HealthController(platform);

    const response = await controller.ready();

    expect(platform.getSystemHealth).toHaveBeenCalledTimes(1);
    expect(response.data).toMatchObject({ api: "ok", supabase: { status: "ok" } });
  });
});
