import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AuditLog,
  DondieAgent,
  DondieMemory,
  DondieWalletLedgerEntry,
  JsonObject,
  JsonValue,
  MarketCandle,
  Notification,
  NotificationPreferences,
  Order,
  OrderStatusEvent,
  Portfolio,
  Position,
  PublicUser,
  RiskRules,
  Signal,
  Strategy,
  Trade,
  UserRole,
  UserStatus,
  UUID
} from "@trading/types";
import type { AuditSink } from "../audit/audit-sink.js";

export interface UserRecord extends PublicUser {
  readonly passwordHash?: string;
  readonly mfaSecretEncrypted?: string;
  readonly provisionedBy?: UUID;
  readonly updatedAt: string;
}

export interface SessionRecord {
  readonly id: UUID;
  readonly userId: UUID;
  refreshTokenHash: string;
  readonly expiresAt: string;
  lastActivityAt: string;
  readonly createdAt: string;
  revokedAt?: string;
}

export interface BrokerAccount {
  readonly id: UUID;
  readonly userId: UUID;
  readonly brokerName: "PAPER" | "ALPACA";
  readonly accountId: string;
  readonly status: "CONNECTED" | "DISCONNECTED";
  readonly encryptedApiKey?: string;
  readonly encryptedSecret?: string;
  readonly environment?: "PAPER" | "LIVE";
  readonly createdAt: string;
}

export interface Watchlist {
  readonly id: UUID;
  readonly userId: UUID;
  readonly name: string;
  symbols: string[];
  readonly createdAt: string;
}

export interface PasswordResetTokenRecord {
  readonly id: UUID;
  readonly userId: UUID;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  usedAt?: string;
}

const isoNow = (): string => new Date().toISOString();

const isSensitiveKey = (key: string): boolean =>
  /password|token|secret|api[_-]?key|authorization|credential/i.test(key);

const redactJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item));
  }

  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? "[REDACTED]" : redactJson(nested);
    }
    return output;
  }

  return value;
};

const freezeJsonObject = (value: JsonObject): JsonObject => Object.freeze({ ...value });
export const defaultNotificationPreferences: NotificationPreferences = Object.freeze({
  trade: true,
  signal: true,
  risk: true,
  system: true
});

@Injectable()
export class PlatformStore {
  readonly users = new Map<UUID, UserRecord>();
  readonly sessions = new Map<UUID, SessionRecord>();
  readonly brokerAccounts = new Map<UUID, BrokerAccount>();
  readonly portfolios = new Map<UUID, Portfolio>();
  readonly strategies = new Map<UUID, Strategy>();
  readonly signals = new Map<UUID, Signal>();
  readonly orders = new Map<UUID, Order>();
  readonly orderStatusEvents = new Map<UUID, OrderStatusEvent>();
  readonly trades = new Map<UUID, Trade>();
  readonly positions = new Map<UUID, Position>();
  readonly riskRules = new Map<UUID, RiskRules>();
  readonly notifications = new Map<UUID, Notification>();
  readonly watchlists = new Map<UUID, Watchlist>();
  readonly passwordResetTokens = new Map<UUID, PasswordResetTokenRecord>();
  readonly marketData = new Map<string, readonly MarketCandle[]>();
  readonly dondieAgents = new Map<UUID, DondieAgent>();
  readonly dondieWalletLedger = new Map<UUID, DondieWalletLedgerEntry>();
  readonly dondieMemories = new Map<UUID, DondieMemory>();
  readonly automationSettings = new Map<UUID, import("@trading/types").AutomationSettings>();
  readonly automationIdempotency = new Map<string, import("@trading/types").AutomationRunResult>();
  readonly auditLogs: AuditLog[] = [];
  private auditSink?: AuditSink;

  setAuditSink(auditSink: AuditSink): void {
    this.auditSink = auditSink;
  }

  createUser(input: {
    readonly id?: UUID;
    readonly email: string;
    readonly passwordHash?: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly role: UserRole;
    readonly status?: UserStatus;
    readonly mfaEnabled?: boolean;
    readonly mfaSecretEncrypted?: string;
    readonly mfaGraceUntil?: string;
    readonly mustChangePassword?: boolean;
    readonly provisionedBy?: UUID;
    readonly notificationPreferences?: NotificationPreferences;
  }): UserRecord {
    const now = isoNow();
    const user: UserRecord = {
      id: input.id ?? randomUUID(),
      email: input.email,
      ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: input.status ?? "ACTIVE",
      mfaEnabled: input.mfaEnabled ?? false,
      ...(input.mfaSecretEncrypted ? { mfaSecretEncrypted: input.mfaSecretEncrypted } : {}),
      ...(input.mfaGraceUntil ? { mfaGraceUntil: input.mfaGraceUntil } : {}),
      ...(input.mustChangePassword !== undefined ? { mustChangePassword: input.mustChangePassword } : {}),
      ...(input.provisionedBy ? { provisionedBy: input.provisionedBy } : {}),
      notificationPreferences: input.notificationPreferences ?? defaultNotificationPreferences,
      createdAt: now,
      updatedAt: now
    };

    this.users.set(user.id, user);
    this.ensureDefaultAccountState(user.id);
    return user;
  }

  createSession(
    userId: UUID,
    refreshTokenHash: string,
    expiresAt: string,
    sessionId: UUID = randomUUID()
  ): SessionRecord {
    const now = isoNow();
    const session: SessionRecord = {
      id: sessionId,
      userId,
      refreshTokenHash,
      expiresAt,
      lastActivityAt: now,
      createdAt: now
    };
    this.sessions.set(session.id, session);
    return session;
  }

  appendAudit(input: {
    readonly userId?: UUID;
    readonly actorUserId?: UUID;
    readonly action: string;
    readonly entityType: string;
    readonly entityId?: UUID;
    readonly metadata?: JsonObject;
  }): AuditLog {
    const base: {
      id: UUID;
      action: string;
      entityType: string;
      metadata: JsonObject;
      createdAt: string;
      userId?: UUID;
      actorUserId?: UUID;
      entityId?: UUID;
    } = {
      id: randomUUID(),
      action: input.action,
      entityType: input.entityType,
      metadata: freezeJsonObject(redactJson(input.metadata ?? {}) as JsonObject),
      createdAt: isoNow()
    };

    if (input.userId !== undefined) {
      base.userId = input.userId;
    }
    if (input.actorUserId !== undefined) {
      base.actorUserId = input.actorUserId;
    }
    if (input.entityId !== undefined) {
      base.entityId = input.entityId;
    }

    const log = Object.freeze(base) as AuditLog;
    this.auditLogs.push(log);
    void this.auditSink?.persist(log).catch(() => undefined);
    return log;
  }

  addNotification(input: {
    readonly userId: UUID;
    readonly notificationType: Notification["notificationType"];
    readonly title: string;
    readonly message: string;
  }): Notification {
    const notification: Notification = {
      id: randomUUID(),
      userId: input.userId,
      notificationType: input.notificationType,
      title: input.title,
      message: input.message,
      status: "UNREAD",
      createdAt: isoNow()
    };
    this.notifications.set(notification.id, notification);
    return notification;
  }

  ensureDefaultAccountState(userId: UUID): void {
    const now = isoNow();
    const seedPaperCash = process.env.ENABLE_E2E_SEED === "true" ? 100_000 : 0;

    if (![...this.portfolios.values()].some((portfolio) => portfolio.userId === userId)) {
      const portfolio: Portfolio = {
        id: randomUUID(),
        userId,
        portfolioName: "Broker Account",
        portfolioValue: seedPaperCash,
        cashBalance: seedPaperCash,
        realizedPnl: 0,
        unrealizedPnl: 0,
        createdAt: now
      };
      this.portfolios.set(portfolio.id, portfolio);
    }

    if (![...this.riskRules.values()].some((rules) => rules.userId === userId)) {
      const rules: RiskRules = {
        id: randomUUID(),
        userId,
        maxRiskPerTradePercent: 1,
        maxDailyLossPercent: 3,
        maxDrawdownPercent: 12,
        maxPositionSizePercent: 25,
        stopTrading: false,
        updatedAt: now
      };
      this.riskRules.set(rules.id, rules);
    }

    if (
      ![...this.brokerAccounts.values()].some(
        (account) => account.userId === userId && account.brokerName === "PAPER"
      )
    ) {
      const brokerAccount: BrokerAccount = {
        id: randomUUID(),
        userId,
        brokerName: "PAPER",
        accountId: `paper-${userId.slice(0, 8)}`,
        status: "CONNECTED",
        createdAt: now
      };
      this.brokerAccounts.set(brokerAccount.id, brokerAccount);
    }

    if (![...this.watchlists.values()].some((watchlist) => watchlist.userId === userId)) {
      const watchlist: Watchlist = {
        id: randomUUID(),
        userId,
        name: "Watchlist",
        symbols: [],
        createdAt: now
      };
      this.watchlists.set(watchlist.id, watchlist);
    }
  }
}
