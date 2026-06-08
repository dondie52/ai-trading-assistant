import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { JwtAuthGuard } from "../src/auth/jwt-auth.guard.js";
import { TokenService } from "../src/auth/token.service.js";
import { PlatformStore } from "../src/store/platform.store.js";
import { SessionActivityService } from "../src/auth/session-activity.service.js";
import { PrismaPlatformRepository } from "../src/infrastructure/prisma-platform.repository.js";
import { PrismaService } from "../src/infrastructure/prisma.service.js";

const contextWithAuthHeader = (authorization: string): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization }
      })
    })
  }) as unknown as ExecutionContext;

describe("JWT auth guard session enforcement", () => {
  it("rejects access tokens after their backing session is revoked", async () => {
    const store = new PlatformStore();
    const tokenService = new TokenService();
    const user = store.createUser({
      email: "guard@example.com",
      passwordHash: "hash",
      firstName: "Guard",
      lastName: "Tester",
      role: "TRADER"
    });
    const session = store.createSession(user.id, "refresh-hash", new Date(Date.now() + 60_000).toISOString());
    const accessToken = tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id
    });
    const sessions = new SessionActivityService(store, new PrismaPlatformRepository(new PrismaService()));
    const guard = new JwtAuthGuard(new Reflector(), tokenService, sessions);

    await expect(guard.canActivate(contextWithAuthHeader(`Bearer ${accessToken}`))).resolves.toBe(true);

    session.revokedAt = new Date().toISOString();

    await expect(guard.canActivate(contextWithAuthHeader(`Bearer ${accessToken}`))).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("revokes sessions that exceed the configured inactivity window", async () => {
    const store = new PlatformStore();
    const tokenService = new TokenService();
    const user = store.createUser({
      email: "idle@example.com",
      passwordHash: "hash",
      firstName: "Idle",
      lastName: "Tester",
      role: "TRADER"
    });
    const session = store.createSession(user.id, "refresh-hash", new Date(Date.now() + 60_000).toISOString());
    session.lastActivityAt = new Date(Date.now() - 31 * 60_000).toISOString();
    const accessToken = tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id
    });
    const sessions = new SessionActivityService(store, new PrismaPlatformRepository(new PrismaService()));
    const guard = new JwtAuthGuard(new Reflector(), tokenService, sessions);

    await expect(guard.canActivate(contextWithAuthHeader(`Bearer ${accessToken}`))).rejects.toThrow(
      UnauthorizedException
    );
    expect(session.revokedAt).toBeTruthy();
    expect(store.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "AUTH_SESSION_EXPIRED",
          metadata: expect.objectContaining({ reason: "idle_timeout" })
        })
      ])
    );
  });
});
