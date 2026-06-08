import { Controller, Get, Inject, Put, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listNotifications(user.sub), page, pageSize));
  }

  @Put("read")
  read(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.markNotificationsRead(user.sub));
  }
}
