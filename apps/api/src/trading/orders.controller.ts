import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("orders")
export class OrdersController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Post()
  async create(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.createOrder(user.sub, body));
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listOrders(user.sub), page, pageSize));
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): ReturnType<typeof ok> {
    return ok(this.platform.listOrders(user.sub).find((order) => order.id === id) ?? null);
  }

  @Get(":id/history")
  history(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listOrderStatusHistory(user.sub, id), page, pageSize));
  }

  @Delete(":id")
  async cancel(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.cancelOrder(user.sub, id));
  }
}
