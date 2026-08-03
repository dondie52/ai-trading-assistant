import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import { SchedulerStatusService } from "../dondie/trade-activity.service.js";
import { PlatformService } from "../platform.service.js";
import { OrderReconciliationService } from "../trading/order-reconciliation.service.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(SchedulerStatusService) private readonly scheduler: SchedulerStatusService,
    @Inject(OrderReconciliationService) private readonly reconciliation: OrderReconciliationService
  ) {}

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

  /**
   * Worker-level health. The trading engine lives on the server, so "is it running?" has
   * to be answerable without a browser session — this is what uptime checks watch.
   */
  @Public()
  @Get("workers")
  workers(): ReturnType<typeof ok> {
    const scheduler = this.scheduler.getStatus();
    const reconciliation = this.reconciliation.getStatus();
    return ok({
      scheduler,
      reconciliation,
      healthy: scheduler.status === "RUNNING",
      uptimeSeconds: Math.round(process.uptime())
    });
  }
}
