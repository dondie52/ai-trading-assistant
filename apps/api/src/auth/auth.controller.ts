import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser, Public } from "./decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { PlatformService } from "../platform.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Public()
  @Post("register")
  async register(@Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.register(body));
  }

  @Public()
  @Post("login")
  async login(@Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.login(body));
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.refresh(body));
  }

  @Public()
  @Post("password-reset/request")
  async requestPasswordReset(@Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.requestPasswordReset(body));
  }

  @Public()
  @Post("password-reset/confirm")
  async confirmPasswordReset(@Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.confirmPasswordReset(body));
  }

  @Post("logout")
  logout(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.platform.logout(user.sub, user.sessionId));
  }

  @Post("mfa/setup")
  async setupMfa(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.setupMfa(user.sub));
  }

  @Post("mfa/enable")
  async enableMfa(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: unknown
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.enableMfa(user.sub, user.sessionId, body));
  }

  @Post("mfa/disable")
  async disableMfa(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: unknown
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.platform.disableMfa(user.sub, user.sessionId, body));
  }
}
