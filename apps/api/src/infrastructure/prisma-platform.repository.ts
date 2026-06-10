import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  AuditLog,
  JsonObject,
  MarketCandle,
  MarketTimeframe,
  Notification,
  NotificationPreferences,
  Order,
  OrderStatusEvent,
  Portfolio,
  Position,
  RiskRules,
  Signal,
  Strategy,
  Trade,
  UUID
} from "@trading/types";
import { PrismaService } from "./prisma.service.js";
import type {
  BrokerAccount,
  PasswordResetTokenRecord,
  SessionRecord,
  UserRecord,
  Watchlist
} from "../store/platform.store.js";
import { defaultNotificationPreferences } from "../store/platform.store.js";
import type { PlatformStore } from "../store/platform.store.js";

interface UserBootstrapState {
  readonly user: UserRecord;
  readonly portfolios: readonly Portfolio[];
  readonly brokerAccounts: readonly BrokerAccount[];
  readonly riskRules: readonly RiskRules[];
  readonly watchlists: readonly Watchlist[];
}

const toDate = (value: string): Date => new Date(value);
const toJson = (value: JsonObject): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const normalizeNotificationPreferences = (value: Prisma.JsonValue): NotificationPreferences => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return defaultNotificationPreferences;
  }
  const record = value as Record<string, unknown>;
  return {
    trade: typeof record.trade === "boolean" ? record.trade : defaultNotificationPreferences.trade,
    signal: typeof record.signal === "boolean" ? record.signal : defaultNotificationPreferences.signal,
    risk: typeof record.risk === "boolean" ? record.risk : defaultNotificationPreferences.risk,
    system: typeof record.system === "boolean" ? record.system : defaultNotificationPreferences.system
  };
};
const preferencesToJson = (preferences: NotificationPreferences): Prisma.InputJsonValue => ({ ...preferences });

@Injectable()
export class PrismaPlatformRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return Boolean(process.env.DATABASE_URL);
  }

  async hydrate(store: PlatformStore): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const client = this.prisma.client();
    const [
      users,
      sessions,
      brokerAccounts,
      portfolios,
      strategies,
      signals,
      orders,
      orderStatusEvents,
      trades,
      positions,
      riskRules,
      notifications,
      watchlists,
      passwordResetTokens,
      auditLogs
    ] = await Promise.all([
      client.user.findMany(),
      client.session.findMany(),
      client.brokerAccount.findMany(),
      client.portfolio.findMany(),
      client.strategy.findMany(),
      client.signal.findMany(),
      client.order.findMany(),
      client.orderStatusEvent.findMany(),
      client.trade.findMany(),
      client.position.findMany(),
      client.riskRule.findMany(),
      client.notification.findMany(),
      client.watchlist.findMany(),
      client.passwordResetToken.findMany(),
      client.auditLog.findMany()
    ]);

    for (const user of users) {
      store.users.set(user.id, {
        id: user.id,
        email: user.email,
        ...(user.passwordHash ? { passwordHash: user.passwordHash } : {}),
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        ...(user.mfaSecretEncrypted ? { mfaSecretEncrypted: user.mfaSecretEncrypted } : {}),
        ...(user.mfaGraceUntil ? { mfaGraceUntil: user.mfaGraceUntil.toISOString() } : {}),
        ...(user.mustChangePassword ? { mustChangePassword: user.mustChangePassword } : {}),
        ...(user.provisionedBy ? { provisionedBy: user.provisionedBy } : {}),
        notificationPreferences: normalizeNotificationPreferences(user.notificationPreferences),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      });
    }

    for (const session of sessions) {
      store.sessions.set(session.id, {
        id: session.id,
        userId: session.userId,
        refreshTokenHash: session.refreshTokenHash,
        expiresAt: session.expiresAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        ...(session.revokedAt ? { revokedAt: session.revokedAt.toISOString() } : {})
      });
    }

    for (const account of brokerAccounts) {
      store.brokerAccounts.set(account.id, {
        id: account.id,
        userId: account.userId,
        brokerName: account.brokerName === "ALPACA" ? "ALPACA" : "PAPER",
        accountId: account.accountId,
        status: account.status === "CONNECTED" ? "CONNECTED" : "DISCONNECTED",
        ...(account.encryptedApiKey ? { encryptedApiKey: account.encryptedApiKey } : {}),
        ...(account.encryptedSecret ? { encryptedSecret: account.encryptedSecret } : {}),
        environment: account.environment === "LIVE" ? "LIVE" : "PAPER",
        createdAt: account.createdAt.toISOString()
      });
    }

    for (const portfolio of portfolios) {
      store.portfolios.set(portfolio.id, {
        id: portfolio.id,
        userId: portfolio.userId,
        portfolioName: portfolio.portfolioName,
        portfolioValue: Number(portfolio.portfolioValue),
        cashBalance: Number(portfolio.cashBalance),
        realizedPnl: Number(portfolio.realizedPnl),
        unrealizedPnl: Number(portfolio.unrealizedPnl),
        createdAt: portfolio.createdAt.toISOString()
      });
    }

    for (const strategy of strategies) {
      store.strategies.set(strategy.id, {
        id: strategy.id,
        userId: strategy.userId,
        name: strategy.name,
        description: strategy.description,
        version: strategy.version,
        status: strategy.status,
        configuration: strategy.configuration as JsonObject,
        createdAt: strategy.createdAt.toISOString(),
        updatedAt: strategy.updatedAt.toISOString()
      });
    }

    for (const signal of signals) {
      store.signals.set(signal.id, {
        id: signal.id,
        userId: signal.userId,
        strategyId: signal.strategyId,
        symbol: signal.symbol,
        signalType: signal.signalType,
        confidenceScore: signal.confidenceScore,
        modelVersion: signal.modelVersion,
        features: signal.features as JsonObject,
        generatedAt: signal.generatedAt.toISOString()
      });
    }

    for (const order of orders) {
      store.orders.set(order.id, {
        id: order.id,
        userId: order.userId,
        brokerAccountId: order.brokerAccountId,
        ...(order.strategyId ? { strategyId: order.strategyId } : {}),
        ...(order.signalId ? { signalId: order.signalId } : {}),
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        mode: order.mode,
        quantity: Number(order.quantity),
        price: Number(order.price),
        stopLoss: Number(order.stopLoss),
        takeProfit: Number(order.takeProfit),
        status: order.status,
        submittedAt: order.submittedAt.toISOString(),
        riskDecision: order.riskDecision as unknown as Order["riskDecision"]
      });
    }

    for (const event of orderStatusEvents) {
      store.orderStatusEvents.set(event.id, {
        id: event.id,
        orderId: event.orderId,
        userId: event.userId,
        status: event.status,
        metadata: event.metadata as JsonObject,
        occurredAt: event.occurredAt.toISOString()
      });
    }

    for (const trade of trades) {
      store.trades.set(trade.id, {
        id: trade.id,
        orderId: trade.orderId,
        userId: trade.userId,
        symbol: trade.symbol,
        side: trade.side,
        quantity: Number(trade.quantity),
        entryPrice: Number(trade.entryPrice),
        ...(trade.exitPrice === null ? {} : { exitPrice: Number(trade.exitPrice) }),
        pnl: Number(trade.pnl),
        openedAt: trade.openedAt.toISOString(),
        ...(trade.closedAt ? { closedAt: trade.closedAt.toISOString() } : {})
      });
    }

    for (const position of positions) {
      store.positions.set(position.id, {
        id: position.id,
        userId: position.userId,
        symbol: position.symbol,
        quantity: Number(position.quantity),
        averagePrice: Number(position.averagePrice),
        unrealizedPnl: Number(position.unrealizedPnl),
        updatedAt: position.updatedAt.toISOString()
      });
    }

    for (const rules of riskRules) {
      store.riskRules.set(rules.id, {
        id: rules.id,
        userId: rules.userId,
        maxRiskPerTradePercent: Number(rules.maxRiskPerTradePercent),
        maxDailyLossPercent: Number(rules.maxDailyLossPercent),
        maxDrawdownPercent: Number(rules.maxDrawdownPercent),
        maxPositionSizePercent: Number(rules.maxPositionSizePercent),
        stopTrading: rules.stopTrading,
        updatedAt: rules.updatedAt.toISOString()
      });
    }

    for (const notification of notifications) {
      store.notifications.set(notification.id, {
        id: notification.id,
        userId: notification.userId,
        notificationType: notification.notificationType,
        title: notification.title,
        message: notification.message,
        status: notification.status,
        createdAt: notification.createdAt.toISOString()
      });
    }

    for (const watchlist of watchlists) {
      store.watchlists.set(watchlist.id, {
        id: watchlist.id,
        userId: watchlist.userId,
        name: watchlist.name,
        symbols: [...watchlist.symbols],
        createdAt: watchlist.createdAt.toISOString()
      });
    }

    for (const token of passwordResetTokens) {
      store.passwordResetTokens.set(token.id, {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt.toISOString(),
        createdAt: token.createdAt.toISOString(),
        ...(token.usedAt ? { usedAt: token.usedAt.toISOString() } : {})
      });
    }

    for (const log of auditLogs) {
      const auditLog: AuditLog = {
        id: log.id,
        ...(log.userId ? { userId: log.userId } : {}),
        ...(log.actorUserId ? { actorUserId: log.actorUserId } : {}),
        action: log.action,
        entityType: log.entityType,
        ...(log.entityId ? { entityId: log.entityId } : {}),
        metadata: log.metadata as JsonObject,
        createdAt: log.createdAt.toISOString()
      };
      if (!store.auditLogs.some((existing) => existing.id === auditLog.id)) {
        store.auditLogs.push(auditLog);
      }
    }
  }

  async persistUserBootstrap(state: UserBootstrapState): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.prisma.client().$transaction(async (tx) => {
      await this.upsertUser(tx, state.user);
      for (const account of state.brokerAccounts) {
        await this.upsertBrokerAccount(tx, account);
      }
      for (const portfolio of state.portfolios) {
        await this.upsertPortfolio(tx, portfolio);
      }
      for (const rules of state.riskRules) {
        await this.upsertRiskRules(tx, rules);
      }
      for (const watchlist of state.watchlists) {
        await this.upsertWatchlist(tx, watchlist);
      }
    });
  }

  async persistUser(user: UserRecord): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.upsertUser(this.prisma.client(), user);
  }

  async persistSession(session: SessionRecord): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().session.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        userId: session.userId,
        refreshTokenHash: session.refreshTokenHash,
        expiresAt: toDate(session.expiresAt),
        lastActivityAt: toDate(session.lastActivityAt),
        revokedAt: session.revokedAt ? toDate(session.revokedAt) : null,
        createdAt: toDate(session.createdAt)
      },
      update: {
        refreshTokenHash: session.refreshTokenHash,
        expiresAt: toDate(session.expiresAt),
        lastActivityAt: toDate(session.lastActivityAt),
        revokedAt: session.revokedAt ? toDate(session.revokedAt) : null
      }
    });
  }

  async persistPasswordResetToken(token: PasswordResetTokenRecord): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().passwordResetToken.upsert({
      where: { id: token.id },
      create: {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: toDate(token.expiresAt),
        usedAt: token.usedAt ? toDate(token.usedAt) : null,
        createdAt: toDate(token.createdAt)
      },
      update: {
        expiresAt: toDate(token.expiresAt),
        usedAt: token.usedAt ? toDate(token.usedAt) : null
      }
    });
  }

  async persistBrokerAccount(account: BrokerAccount): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.upsertBrokerAccount(this.prisma.client(), account);
  }

  async deleteBrokerAccount(id: UUID): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().brokerAccount.deleteMany({ where: { id } });
  }

  async persistPortfolio(portfolio: Portfolio): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.upsertPortfolio(this.prisma.client(), portfolio);
  }

  async persistStrategy(strategy: Strategy): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().strategy.upsert({
      where: { id: strategy.id },
      create: {
        id: strategy.id,
        userId: strategy.userId,
        name: strategy.name,
        description: strategy.description,
        version: strategy.version,
        status: strategy.status,
        configuration: toJson(strategy.configuration),
        createdAt: toDate(strategy.createdAt),
        updatedAt: toDate(strategy.updatedAt)
      },
      update: {
        name: strategy.name,
        description: strategy.description,
        version: strategy.version,
        status: strategy.status,
        configuration: toJson(strategy.configuration),
        updatedAt: toDate(strategy.updatedAt)
      }
    });
  }

  async deleteStrategy(id: UUID): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().strategy.deleteMany({ where: { id } });
  }

  async persistSignal(signal: Signal): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().signal.upsert({
      where: { id: signal.id },
      create: {
        id: signal.id,
        userId: signal.userId,
        strategyId: signal.strategyId,
        symbol: signal.symbol,
        signalType: signal.signalType,
        confidenceScore: signal.confidenceScore,
        modelVersion: signal.modelVersion,
        features: toJson(signal.features),
        generatedAt: toDate(signal.generatedAt)
      },
      update: {
        signalType: signal.signalType,
        confidenceScore: signal.confidenceScore,
        modelVersion: signal.modelVersion,
        features: toJson(signal.features)
      }
    });
  }

  async persistOrder(order: Order): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        userId: order.userId,
        brokerAccountId: order.brokerAccountId,
        strategyId: order.strategyId ?? null,
        signalId: order.signalId ?? null,
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        mode: order.mode,
        quantity: order.quantity,
        price: order.price,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        status: order.status,
        riskDecision: order.riskDecision as unknown as Prisma.InputJsonValue,
        submittedAt: toDate(order.submittedAt)
      },
      update: {
        status: order.status,
        riskDecision: order.riskDecision as unknown as Prisma.InputJsonValue
      }
    });
  }

  async persistOrderStatusEvent(event: OrderStatusEvent): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().orderStatusEvent.create({
      data: {
        id: event.id,
        orderId: event.orderId,
        userId: event.userId,
        status: event.status,
        metadata: toJson(event.metadata),
        occurredAt: toDate(event.occurredAt)
      }
    });
  }

  async persistTrade(trade: Trade): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().trade.upsert({
      where: { id: trade.id },
      create: {
        id: trade.id,
        orderId: trade.orderId,
        userId: trade.userId,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice ?? null,
        pnl: trade.pnl,
        openedAt: toDate(trade.openedAt),
        closedAt: trade.closedAt ? toDate(trade.closedAt) : null
      },
      update: {
        exitPrice: trade.exitPrice ?? null,
        pnl: trade.pnl,
        closedAt: trade.closedAt ? toDate(trade.closedAt) : null
      }
    });
  }

  async persistPosition(position: Position): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().position.upsert({
      where: {
        userId_symbol: {
          userId: position.userId,
          symbol: position.symbol
        }
      },
      create: {
        id: position.id,
        userId: position.userId,
        symbol: position.symbol,
        quantity: position.quantity,
        averagePrice: position.averagePrice,
        unrealizedPnl: position.unrealizedPnl,
        updatedAt: toDate(position.updatedAt)
      },
      update: {
        quantity: position.quantity,
        averagePrice: position.averagePrice,
        unrealizedPnl: position.unrealizedPnl,
        updatedAt: toDate(position.updatedAt)
      }
    });
  }

  async persistRiskRules(rules: RiskRules): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.upsertRiskRules(this.prisma.client(), rules);
  }

  async persistNotification(notification: Notification): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().notification.upsert({
      where: { id: notification.id },
      create: {
        id: notification.id,
        userId: notification.userId,
        notificationType: notification.notificationType,
        title: notification.title,
        message: notification.message,
        status: notification.status,
        createdAt: toDate(notification.createdAt)
      },
      update: {
        status: notification.status,
        title: notification.title,
        message: notification.message
      }
    });
  }

  async markNotificationsRead(userId: UUID): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().notification.updateMany({
      where: { userId },
      data: { status: "READ" }
    });
  }

  async persistWatchlist(watchlist: Watchlist): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.upsertWatchlist(this.prisma.client(), watchlist);
  }

  async persistMarketData(
    symbol: string,
    timeframe: MarketTimeframe,
    candles: readonly MarketCandle[]
  ): Promise<void> {
    if (!this.isEnabled() || candles.length === 0) {
      return;
    }
    await this.prisma.client().marketPrice.createMany({
      data: candles.map((candle) => ({
        symbol: symbol.toUpperCase(),
        timeframe,
        timestamp: toDate(candle.timestamp),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: BigInt(candle.volume)
      })),
      skipDuplicates: true
    });
  }

  private async upsertUser(client: Prisma.TransactionClient | ReturnType<PrismaService["client"]>, user: UserRecord) {
    await client.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash ?? null,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        mfaSecretEncrypted: user.mfaSecretEncrypted ?? null,
        mfaGraceUntil: user.mfaGraceUntil ? toDate(user.mfaGraceUntil) : null,
        mustChangePassword: user.mustChangePassword ?? false,
        provisionedBy: user.provisionedBy ?? null,
        notificationPreferences: preferencesToJson(user.notificationPreferences),
        createdAt: toDate(user.createdAt),
        updatedAt: toDate(user.updatedAt)
      },
      update: {
        email: user.email,
        passwordHash: user.passwordHash ?? null,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        mfaSecretEncrypted: user.mfaSecretEncrypted ?? null,
        mfaGraceUntil: user.mfaGraceUntil ? toDate(user.mfaGraceUntil) : null,
        mustChangePassword: user.mustChangePassword ?? false,
        provisionedBy: user.provisionedBy ?? null,
        notificationPreferences: preferencesToJson(user.notificationPreferences),
        updatedAt: toDate(user.updatedAt)
      }
    });
  }

  private async upsertBrokerAccount(
    client: Prisma.TransactionClient | ReturnType<PrismaService["client"]>,
    account: BrokerAccount
  ) {
    await client.brokerAccount.upsert({
      where: { id: account.id },
      create: {
        id: account.id,
        userId: account.userId,
        brokerName: account.brokerName,
        accountId: account.accountId,
        environment: account.environment ?? "PAPER",
        encryptedApiKey: account.encryptedApiKey ?? null,
        encryptedSecret: account.encryptedSecret ?? null,
        status: account.status,
        createdAt: toDate(account.createdAt)
      },
      update: {
        accountId: account.accountId,
        environment: account.environment ?? "PAPER",
        encryptedApiKey: account.encryptedApiKey ?? null,
        encryptedSecret: account.encryptedSecret ?? null,
        status: account.status
      }
    });
  }

  private async upsertPortfolio(
    client: Prisma.TransactionClient | ReturnType<PrismaService["client"]>,
    portfolio: Portfolio
  ) {
    await client.portfolio.upsert({
      where: { id: portfolio.id },
      create: {
        id: portfolio.id,
        userId: portfolio.userId,
        portfolioName: portfolio.portfolioName,
        portfolioValue: portfolio.portfolioValue,
        cashBalance: portfolio.cashBalance,
        realizedPnl: portfolio.realizedPnl,
        unrealizedPnl: portfolio.unrealizedPnl,
        createdAt: toDate(portfolio.createdAt)
      },
      update: {
        portfolioName: portfolio.portfolioName,
        portfolioValue: portfolio.portfolioValue,
        cashBalance: portfolio.cashBalance,
        realizedPnl: portfolio.realizedPnl,
        unrealizedPnl: portfolio.unrealizedPnl
      }
    });
  }

  private async upsertRiskRules(
    client: Prisma.TransactionClient | ReturnType<PrismaService["client"]>,
    rules: RiskRules
  ) {
    await client.riskRule.upsert({
      where: { userId: rules.userId },
      create: {
        id: rules.id,
        userId: rules.userId,
        maxRiskPerTradePercent: rules.maxRiskPerTradePercent,
        maxDailyLossPercent: rules.maxDailyLossPercent,
        maxDrawdownPercent: rules.maxDrawdownPercent,
        maxPositionSizePercent: rules.maxPositionSizePercent,
        stopTrading: rules.stopTrading,
        updatedAt: toDate(rules.updatedAt)
      },
      update: {
        maxRiskPerTradePercent: rules.maxRiskPerTradePercent,
        maxDailyLossPercent: rules.maxDailyLossPercent,
        maxDrawdownPercent: rules.maxDrawdownPercent,
        maxPositionSizePercent: rules.maxPositionSizePercent,
        stopTrading: rules.stopTrading,
        updatedAt: toDate(rules.updatedAt)
      }
    });
  }

  private async upsertWatchlist(
    client: Prisma.TransactionClient | ReturnType<PrismaService["client"]>,
    watchlist: Watchlist
  ) {
    await client.watchlist.upsert({
      where: { id: watchlist.id },
      create: {
        id: watchlist.id,
        userId: watchlist.userId,
        name: watchlist.name,
        symbols: [...watchlist.symbols],
        createdAt: toDate(watchlist.createdAt)
      },
      update: {
        name: watchlist.name,
        symbols: [...watchlist.symbols]
      }
    });
  }
}
