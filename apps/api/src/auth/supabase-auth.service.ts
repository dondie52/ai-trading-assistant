import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { UserRole, UUID } from "@trading/types";
import type { AuthenticatedPrincipal } from "../common/request.js";

export interface SupabaseJwtClaims extends JWTPayload {
  readonly sub: string;
  readonly email?: string;
  readonly session_id?: string;
  readonly aal?: string;
  readonly platform_role?: string;
}

const resolveSupabaseUrl = (): string => {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("SUPABASE_URL must be configured when AUTH_PROVIDER=supabase.");
  }
  return url.replace(/\/$/u, "");
};

@Injectable()
export class SupabaseAuthService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private issuer?: string;

  private getJwks(): { readonly jwks: ReturnType<typeof createRemoteJWKSet>; readonly issuer: string } {
    if (!this.jwks || !this.issuer) {
      const baseUrl = resolveSupabaseUrl();
      this.issuer = `${baseUrl}/auth/v1`;
      this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
    }
    return { jwks: this.jwks, issuer: this.issuer };
  }

  async verifyAccessToken(token: string): Promise<SupabaseJwtClaims> {
    const { jwks, issuer } = this.getJwks();
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated"
      });
      if (typeof payload.sub !== "string") {
        throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "Invalid access token." });
      }
      return payload as SupabaseJwtClaims;
    } catch {
      throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "Invalid access token." });
    }
  }

  toPrincipal(claims: SupabaseJwtClaims, role: UserRole): AuthenticatedPrincipal {
    const sessionId = typeof claims.session_id === "string" ? claims.session_id : claims.sub;
    return {
      sub: claims.sub as UUID,
      email: typeof claims.email === "string" ? claims.email : "",
      role,
      sessionId: sessionId as UUID,
      type: "access",
      aal: claims.aal === "aal2" ? "aal2" : "aal1"
    };
  }
}
