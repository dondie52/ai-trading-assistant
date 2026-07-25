import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { OptionalAuthenticatedRequest } from "./request.js";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const readPositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  canActivate(context: ExecutionContext): boolean {
    if (process.env.RATE_LIMIT_DISABLED === "true") {
      return true;
    }

    const request = context.switchToHttp().getRequest<OptionalAuthenticatedRequest>();
    const path = request.route?.path ?? request.url ?? "unknown";
    // Keepalive + Render probes must never compete with the rate limiter.
    if (typeof path === "string" && (path.includes("/health") || path.endsWith("health"))) {
      return true;
    }

    const windowMs = readPositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
    const maxRequests = readPositiveInteger(process.env.RATE_LIMIT_MAX, 600);
    const now = Date.now();
    const identity =
      request.user?.sub ??
      request.ip ??
      request.socket.remoteAddress ??
      request.headers["x-forwarded-for"] ??
      "anonymous";
    const key = `${identity}:${request.method}:${path}`;
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    if (bucket.count > maxRequests) {
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Too many requests. Please retry after the rate limit window resets."
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }
}
