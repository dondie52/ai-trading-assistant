import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("strategies")
export class StrategiesController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): ReturnType<typeof ok> {
    return ok(this.platform.createStrategy(user.sub, body));
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listStrategies(user.sub), page, pageSize));
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): ReturnType<typeof ok> {
    return ok(this.platform.listStrategies(user.sub).find((strategy) => strategy.id === id) ?? null);
  }

  @Put(":id")
  update(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Body() body: unknown
  ): ReturnType<typeof ok> {
    return ok(this.platform.updateStrategy(user.sub, id, body));
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): ReturnType<typeof ok> {
    return ok(this.platform.deleteStrategy(user.sub, id));
  }
}
