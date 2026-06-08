import { Controller, Get, Inject, Param } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";

@Controller("reports")
export class ReportsController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("performance/:format")
  performance(@CurrentUser() user: AuthenticatedPrincipal, @Param("format") format: string): ReturnType<typeof ok> {
    return ok(this.platform.exportPerformanceReport(user.sub, format));
  }
}
