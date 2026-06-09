import { Body, Controller, Get, Inject, Param, Put, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("market")
export class MarketController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("prices/:symbol")
  async prices(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("symbol") symbol: string,
    @Query("timeframe") timeframe?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<ReturnType<typeof ok>> {
    return ok(
      paginate(
        await this.platform.listMarketData(user.sub, symbol, this.platform.parseMarketTimeframe(timeframe)),
        page,
        pageSize
      )
    );
  }

  @Get("quotes/:symbol")
  quote(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("symbol") symbol: string,
    @Query("timeframe") timeframe?: string
  ): Promise<ReturnType<typeof ok>> {
    return this.platform
      .getMarketQuoteForUser(user.sub, symbol, this.platform.parseMarketTimeframe(timeframe))
      .then(ok);
  }

  @Get("indicators/:symbol")
  async indicators(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("symbol") symbol: string,
    @Query("timeframe") timeframe?: string
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.getIndicators(user.sub, symbol, this.platform.parseMarketTimeframe(timeframe)));
  }

  @Get("watchlists")
  watchlists(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listWatchlists(user.sub), page, pageSize));
  }

  @Put("watchlists")
  updateWatchlist(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): ReturnType<typeof ok> {
    return ok(this.platform.updateWatchlist(user.sub, body));
  }
}
