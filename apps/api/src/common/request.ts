import type { Request } from "express";
import type { UserRole, UUID } from "@trading/types";

export interface AuthenticatedPrincipal {
  readonly sub: UUID;
  readonly email: string;
  readonly role: UserRole;
  readonly sessionId: UUID;
  readonly type: "access";
}

export interface AuthenticatedRequest extends Request {
  readonly user: AuthenticatedPrincipal;
}

export interface OptionalAuthenticatedRequest extends Request {
  user?: AuthenticatedPrincipal;
}
