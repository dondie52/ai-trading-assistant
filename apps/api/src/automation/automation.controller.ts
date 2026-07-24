import { Body, Controller, Get, Inject, Post, Put } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";

@Controller("automation")
export class AutomationController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("settings")
  settings(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.getAutomationSettings(user.sub));
  }

  @Put("settings")
  updateSettings(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: unknown
  ): ReturnType<typeof ok> {
    return ok(this.platform.updateAutomationSettings(user.sub, body));
  }

  @Post("emergency-pause")
  emergencyPause(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.emergencyPause(user.sub));
  }

  @Post("run")
  async run(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.runAutomation(user.sub, body));
  }
}
