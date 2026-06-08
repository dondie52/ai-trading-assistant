import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("signals")
export class SignalsController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listSignals(user.sub), page, pageSize));
  }

  @Get("history")
  history(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listSignals(user.sub), page, pageSize));
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): ReturnType<typeof ok> {
    return ok(this.platform.listSignals(user.sub).find((signal) => signal.id === id) ?? null);
  }

  @Post("generate")
  async generate(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.generateTradingSignal(user.sub, body));
  }
}
