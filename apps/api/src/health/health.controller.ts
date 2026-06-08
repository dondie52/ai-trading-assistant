import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import { PlatformService } from "../platform.service.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Public()
  @Get()
  async get(): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.getSystemHealth());
  }
}
