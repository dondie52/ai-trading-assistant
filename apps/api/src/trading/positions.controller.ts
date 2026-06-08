import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("positions")
export class PositionsController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listPositions(user.sub), page, pageSize));
  }

  @Get(":symbol")
  detail(@CurrentUser() user: AuthenticatedPrincipal, @Param("symbol") symbol: string): ReturnType<typeof ok> {
    return ok(
      this.platform
        .listPositions(user.sub)
        .find((position) => position.symbol === symbol.toUpperCase()) ?? null
    );
  }
}
