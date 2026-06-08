import { Body, Controller, Get, Inject, Param, Put, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("users")
  users(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listAdminUsers(user.sub), page, pageSize));
  }

  @Get("system-health")
  async systemHealth(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.getSystemHealth(user.sub));
  }

  @Get("metrics")
  async metrics(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.getOperationalMetrics(user.sub));
  }

  @Put("users/:id/status")
  async updateUserStatus(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Body() body: unknown
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.updateAdminUserStatus(user.sub, id, body));
  }

  @Get("audit-logs")
  auditLogs(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): ReturnType<typeof ok> {
    return ok(paginate(this.platform.listAuditLogs(user.sub), page, pageSize));
  }
}
