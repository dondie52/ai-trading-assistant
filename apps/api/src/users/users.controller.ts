import { Body, Controller, Delete, Get, Inject, Put } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";

@Controller("users")
export class UsersController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.getMe(user.sub));
  }

  @Get("profile")
  profile(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.getMe(user.sub));
  }

  @Put("profile")
  updateProfile(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): ReturnType<typeof ok> {
    return ok(this.platform.updateProfile(user.sub, body));
  }

  @Delete("account")
  deleteAccount(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.deleteAccount(user.sub));
  }
}
