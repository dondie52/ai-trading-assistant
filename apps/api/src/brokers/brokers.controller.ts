import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("brokers")
export class BrokersController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Post("connect")
  async connect(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.connectBroker(user.sub, body));
  }

  @Get("accounts")
  accounts(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listBrokerAccounts(user.sub), page, pageSize));
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): ReturnType<typeof ok> {
    return ok(this.platform.deleteBrokerAccount(user.sub, id));
  }
}
