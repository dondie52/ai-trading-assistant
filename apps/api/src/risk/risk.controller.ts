import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";

@Controller("risk")
export class RiskController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.getRiskRules(user.sub));
  }

  @Put()
  update(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): ReturnType<typeof ok> {
    return ok(this.platform.updateRiskRules(user.sub, body));
  }
}
