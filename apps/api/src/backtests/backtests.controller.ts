import { Body, Controller, Inject, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";

@Controller("backtests")
export class BacktestsController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Post("run")
  async run(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.runBacktest(user.sub, body));
  }

  @Post("walk-forward")
  async walkForward(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: unknown
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.runWalkForwardBacktest(user.sub, body));
  }
}
