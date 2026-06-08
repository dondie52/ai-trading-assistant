import { Controller, Get, Inject } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";

@Controller("analytics")
export class AnalyticsController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("performance")
  performance(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.getPerformance(user.sub));
  }

  @Get("drawdown")
  drawdown(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok({ maxDrawdown: this.platform.getPerformance(user.sub).maxDrawdown });
  }

  @Get("sharpe")
  sharpe(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok({ sharpeRatio: this.platform.getPerformance(user.sub).sharpeRatio });
  }

  @Get("winrate")
  winRate(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok({ winRate: this.platform.getPerformance(user.sub).winRate });
  }
}
