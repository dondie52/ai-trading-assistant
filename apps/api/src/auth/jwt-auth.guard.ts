import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./decorators.js";
import { TokenService } from "./token.service.js";
import type { OptionalAuthenticatedRequest } from "../common/request.js";
import { SessionActivityService } from "./session-activity.service.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
    @Inject(SessionActivityService)
    private readonly sessions: SessionActivityService
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
    const principal = this.tokenService.verifyAccessToken(token);
    await this.sessions.assertActive(principal.sub, principal.sessionId);

    request.user = principal;
    return true;
  }
}
