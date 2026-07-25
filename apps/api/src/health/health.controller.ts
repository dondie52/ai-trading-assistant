import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import { PlatformService } from "../platform.service.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  /**
   * Liveness probe for Render (`healthCheckPath`).
   * Must stay DB-free and sub-second — free-tier Supabase/`SELECT 1` hangs caused
   * "HTTP health check failed (timed out after 5 seconds)".
   */
  @Public()
  @Get()
  get(): ReturnType<typeof ok> {
    return ok({
      api: "ok",
      uptimeSeconds: Math.round(process.uptime())
    });
  }

  /** Readiness probe with a bounded database check (not used by Render). */
  @Public()
  @Get("ready")
  async ready(): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.getSystemHealth());
  }
}
