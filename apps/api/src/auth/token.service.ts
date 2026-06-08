import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole, UUID } from "@trading/types";
import type { AuthenticatedPrincipal } from "../common/request.js";

interface RefreshPrincipal {
  readonly sub: UUID;
  readonly email: string;
  readonly role: UserRole;
  readonly sessionId: UUID;
  readonly type: "refresh";
}

const resolveSecret = (envName: string): string => {
  const configured = process.env[envName];
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envName} must be configured with at least 32 characters in production.`);
  }
  return randomBytes(48).toString("hex");
};

@Injectable()
export class TokenService {
  private readonly accessSecret = resolveSecret("JWT_ACCESS_SECRET");
  private readonly refreshSecret = resolveSecret("JWT_REFRESH_SECRET");

  signAccessToken(principal: Omit<AuthenticatedPrincipal, "type">): string {
    return jwt.sign({ ...principal, type: "access" }, this.accessSecret, {
      expiresIn: "15m",
      issuer: "ai-trading-platform",
      audience: "trading-api"
    });
  }

  signRefreshToken(principal: Omit<RefreshPrincipal, "type">): string {
    return jwt.sign({ ...principal, type: "refresh" }, this.refreshSecret, {
      expiresIn: "7d",
      issuer: "ai-trading-platform",
      audience: "trading-api",
      jwtid: randomUUID()
    });
  }

  verifyAccessToken(token: string): AuthenticatedPrincipal {
    const decoded = jwt.verify(token, this.accessSecret, {
      issuer: "ai-trading-platform",
      audience: "trading-api"
    });

    if (!this.isAccessPrincipal(decoded)) {
      throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "Invalid access token." });
    }

    return decoded;
  }

  verifyRefreshToken(token: string): RefreshPrincipal {
    const decoded = jwt.verify(token, this.refreshSecret, {
      issuer: "ai-trading-platform",
      audience: "trading-api"
    });

    if (!this.isRefreshPrincipal(decoded)) {
      throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "Invalid refresh token." });
    }

    return decoded;
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private isAccessPrincipal(value: unknown): value is AuthenticatedPrincipal {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return (
      typeof record.sub === "string" &&
      typeof record.email === "string" &&
      (record.role === "TRADER" || record.role === "ADMIN") &&
      typeof record.sessionId === "string" &&
      record.type === "access"
    );
  }

  private isRefreshPrincipal(value: unknown): value is RefreshPrincipal {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return (
      typeof record.sub === "string" &&
      typeof record.email === "string" &&
      (record.role === "TRADER" || record.role === "ADMIN") &&
      typeof record.sessionId === "string" &&
      record.type === "refresh"
    );
  }
}
