import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("portfolios")
export class PortfolioController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<ReturnType<typeof ok>> {
    return ok(paginate(await this.platform.listPortfoliosFresh(user.sub), page, pageSize));
  }

  @Get(":id")
  async detail(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): Promise<ReturnType<typeof ok>> {
    await this.platform.syncAlpacaState(user.sub);
    return ok(this.platform.getPortfolio(user.sub, id));
  }

  @Get(":id/performance")
  async performance(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string
  ): Promise<ReturnType<typeof ok>> {
    await this.platform.syncAlpacaState(user.sub);
    this.platform.getPortfolio(user.sub, id);
    return ok(this.platform.getPerformance(user.sub));
  }
}
