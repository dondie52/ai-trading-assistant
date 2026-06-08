import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { UUID } from "@trading/types";
import { PrismaPlatformRepository } from "../infrastructure/prisma-platform.repository.js";
import { PlatformStore, type SessionRecord } from "../store/platform.store.js";

const readPositiveMinutes = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

@Injectable()
export class SessionActivityService {
  constructor(
    @Inject(PlatformStore)
    private readonly store: PlatformStore,
    @Inject(PrismaPlatformRepository)
    private readonly repository: PrismaPlatformRepository
  ) {}

  async assertActive(userId: UUID, sessionId: UUID, touch = true): Promise<SessionRecord> {
    const session = this.store.sessions.get(sessionId);
    const user = this.store.users.get(userId);
    const now = Date.now();
    const idleTimeoutMs = readPositiveMinutes(process.env.SESSION_IDLE_TIMEOUT_MINUTES, 30) * 60_000;
    const inactive =
      !session ||
      !user ||
      session.userId !== userId ||
      session.revokedAt !== undefined ||
      Date.parse(session.expiresAt) <= now ||
      now - Date.parse(session.lastActivityAt) >= idleTimeoutMs ||
      user.status !== "ACTIVE";

    if (inactive) {
      if (session && session.revokedAt === undefined) {
        session.revokedAt = new Date(now).toISOString();
        await this.repository.persistSession(session);
        this.store.appendAudit({
          userId,
          actorUserId: userId,
          action: "AUTH_SESSION_EXPIRED",
          entityType: "SESSION",
          entityId: session.id,
          metadata: {
            reason:
              Date.parse(session.expiresAt) <= now
                ? "absolute_expiry"
                : now - Date.parse(session.lastActivityAt) >= idleTimeoutMs
                  ? "idle_timeout"
                  : "account_or_session_inactive"
          }
        });
      }
      throw new UnauthorizedException({
        code: "INVALID_SESSION",
        message: "Session is no longer active."
      });
    }

    if (touch && now - Date.parse(session.lastActivityAt) >= 60_000) {
      session.lastActivityAt = new Date(now).toISOString();
      await this.repository.persistSession(session);
    }
    return session;
  }
}
