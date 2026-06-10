import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./decorators.js";
import { TokenService } from "./token.service.js";
import type { OptionalAuthenticatedRequest } from "../common/request.js";
import { SessionActivityService } from "./session-activity.service.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";
import { isMfaRequired, isSupabaseAuth } from "./auth-provider.js";
import { PlatformStore } from "../store/platform.store.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
    @Inject(SessionActivityService)
    private readonly sessions: SessionActivityService,
    @Inject(SupabaseAuthService)
    private readonly supabaseAuth: SupabaseAuthService,
    @Inject(PlatformStore)
    private readonly store: PlatformStore
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<OptionalAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Missing bearer token." });
    }

    const token = authorization.slice("Bearer ".length);
    if (isSupabaseAuth()) {
      request.user = await this.authenticateSupabase(token);
      return true;
    }

    const principal = this.tokenService.verifyAccessToken(token);
    await this.sessions.assertActive(principal.sub, principal.sessionId);
    request.user = principal;
    return true;
  }

  private async authenticateSupabase(token: string) {
    const claims = await this.supabaseAuth.verifyAccessToken(token);
    const user = this.store.users.get(claims.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: "USER_NOT_PROVISIONED",
        message: "This account is not provisioned for platform access."
      });
    }

    const roleFromClaim =
      typeof claims.platform_role === "string" && (claims.platform_role === "ADMIN" || claims.platform_role === "TRADER")
        ? claims.platform_role
        : user.role;
    const principal = this.supabaseAuth.toPrincipal(claims, roleFromClaim);
    this.sessions.ensureSupabaseSession(principal.sub, principal.sessionId);
    await this.sessions.assertActive(principal.sub, principal.sessionId);
    this.assertMfaPolicy(principal.aal, user.mfaGraceUntil, user.mfaEnabled);
    return principal;
  }

  private assertMfaPolicy(
    aal: "aal1" | "aal2" | undefined,
    mfaGraceUntil: string | undefined,
    mfaEnabled: boolean
  ): void {
    if (!isMfaRequired()) {
      return;
    }
    if (aal === "aal2" || mfaEnabled) {
      return;
    }
    const graceActive = mfaGraceUntil ? Date.parse(mfaGraceUntil) > Date.now() : false;
    if (graceActive) {
      return;
    }
    throw new ForbiddenException({
      code: "MFA_SETUP_REQUIRED",
      message: "Multi-factor authentication is required. Enable MFA in Settings."
    });
  }
}
