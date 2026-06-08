import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketCandle, Notification, Order, OrderStatusEvent } from "@trading/types";
import { PrismaPlatformRepository } from "../src/infrastructure/prisma-platform.repository.js";
import type { PrismaService } from "../src/infrastructure/prisma.service.js";
import { RedisCacheQueueService } from "../src/infrastructure/redis-cache-queue.service.js";
import type { RedisService } from "../src/infrastructure/redis.service.js";

const previousDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://localhost:5432/trading";
});

afterEach(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
  vi.restoreAllMocks();
});

describe("platform persistence boundary", () => {
  it("persists a registered user and default account state in one Prisma transaction", async () => {
    const tx = {
      user: { upsert: vi.fn().mockResolvedValue({}) },
      brokerAccount: { upsert: vi.fn().mockResolvedValue({}) },
      portfolio: { upsert: vi.fn().mockResolvedValue({}) },
      riskRule: { upsert: vi.fn().mockResolvedValue({}) },
      watchlist: { upsert: vi.fn().mockResolvedValue({}) }
    };
    const client = {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx))
    };
    const repository = new PrismaPlatformRepository({
      client: () => client
    } as unknown as PrismaService);

    await repository.persistUserBootstrap({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "persist@example.com",
        passwordHash: "bcrypt-hash",
        firstName: "Persist",
        lastName: "Trader",
        role: "TRADER",
        status: "ACTIVE",
        mfaEnabled: false,
        notificationPreferences: {
          trade: true,
          signal: true,
          risk: true,
          system: true
        },
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z"
      },
      brokerAccounts: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          userId: "11111111-1111-4111-8111-111111111111",
          brokerName: "PAPER",
          accountId: "paper-11111111",
          status: "CONNECTED",
          createdAt: "2026-06-05T00:00:00.000Z"
        }
      ],
      portfolios: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          userId: "11111111-1111-4111-8111-111111111111",
          portfolioName: "Paper Trading Account",
          portfolioValue: 100_000,
          cashBalance: 100_000,
          realizedPnl: 0,
          unrealizedPnl: 0,
          createdAt: "2026-06-05T00:00:00.000Z"
        }
      ],
      riskRules: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          userId: "11111111-1111-4111-8111-111111111111",
          maxRiskPerTradePercent: 1,
          maxDailyLossPercent: 3,
          maxDrawdownPercent: 12,
          maxPositionSizePercent: 25,
          stopTrading: false,
          updatedAt: "2026-06-05T00:00:00.000Z"
        }
      ],
      watchlists: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          userId: "11111111-1111-4111-8111-111111111111",
          name: "Core Tech",
          symbols: ["AAPL", "MSFT"],
          createdAt: "2026-06-05T00:00:00.000Z"
        }
      ]
    });

    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          email: "persist@example.com",
          passwordHash: "bcrypt-hash",
          notificationPreferences: {
            trade: true,
            signal: true,
            risk: true,
            system: true
          }
        })
      })
    );
    expect(tx.portfolio.upsert).toHaveBeenCalledTimes(1);
    expect(tx.riskRule.upsert).toHaveBeenCalledTimes(1);
    expect(tx.brokerAccount.upsert).toHaveBeenCalledTimes(1);
    expect(tx.watchlist.upsert).toHaveBeenCalledTimes(1);
  });

  it("persists only encrypted broker credentials", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const repository = new PrismaPlatformRepository({
      client: () => ({
        brokerAccount: { upsert }
      })
    } as unknown as PrismaService);

    await repository.persistBrokerAccount({
      id: "22222222-2222-4222-8222-222222222222",
      userId: "11111111-1111-4111-8111-111111111111",
      brokerName: "ALPACA",
      accountId: "paper-account",
      status: "CONNECTED",
      encryptedApiKey: "encrypted-api-key",
      encryptedSecret: "encrypted-secret",
      createdAt: "2026-06-05T00:00:00.000Z"
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          encryptedApiKey: "encrypted-api-key",
          encryptedSecret: "encrypted-secret"
        }),
        update: expect.objectContaining({
          encryptedApiKey: "encrypted-api-key",
          encryptedSecret: "encrypted-secret"
        })
      })
    );
  });

  it("persists risk-reviewed orders with their risk decision JSON", async () => {
    const orderUpsert = vi.fn().mockResolvedValue({});
    const repository = new PrismaPlatformRepository({
      client: () => ({
        order: { upsert: orderUpsert }
      })
    } as unknown as PrismaService);
    const order: Order = {
      id: "66666666-6666-4666-8666-666666666666",
      userId: "11111111-1111-4111-8111-111111111111",
      brokerAccountId: "22222222-2222-4222-8222-222222222222",
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "AUTO",
      quantity: 5,
      price: 200,
      stopLoss: 196,
      takeProfit: 220,
      status: "FILLED",
      submittedAt: "2026-06-05T00:00:00.000Z",
      riskDecision: {
        approved: true,
        reasons: [],
        maxRiskAmount: 1_000,
        proposedRiskAmount: 20,
        proposedPositionValue: 1_000,
        calculatedQuantity: 5
      }
    };

    await repository.persistOrder(order);

    expect(orderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "FILLED",
          riskDecision: expect.objectContaining({ approved: true })
        })
      })
    );
  });

  it("persists append-only order lifecycle events", async () => {
    const create = vi.fn().mockResolvedValue({});
    const repository = new PrismaPlatformRepository({
      client: () => ({
        orderStatusEvent: { create }
      })
    } as unknown as PrismaService);
    const event: OrderStatusEvent = {
      id: "88888888-8888-4888-8888-888888888888",
      orderId: "66666666-6666-4666-8666-666666666666",
      userId: "11111111-1111-4111-8111-111111111111",
      status: "SUBMITTED",
      metadata: { broker: "PAPER" },
      occurredAt: "2026-06-06T08:00:00.000Z"
    };

    await repository.persistOrderStatusEvent(event);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: event.id,
        orderId: event.orderId,
        status: "SUBMITTED",
        metadata: { broker: "PAPER" }
      })
    });
  });

  it("persists market candles with timeframe metadata", async () => {
    const createMany = vi.fn().mockResolvedValue({});
    const repository = new PrismaPlatformRepository({
      client: () => ({
        marketPrice: { createMany }
      })
    } as unknown as PrismaService);
    const candles: MarketCandle[] = [
      {
        symbol: "MSFT",
        timeframe: "1h",
        timestamp: "2026-06-05T00:00:00.000Z",
        open: 410,
        high: 414,
        low: 408,
        close: 413,
        volume: 1_500_000
      }
    ];

    await repository.persistMarketData("msft", "1h", candles);

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            symbol: "MSFT",
            timeframe: "1h",
            volume: 1_500_000n
          })
        ],
        skipDuplicates: true
      })
    );
  });
});

describe("Redis cache and queue boundary", () => {
  it("queues notifications and caches market candles when Redis is configured", async () => {
    const redis = {
      isConfigured: () => true,
      rpush: vi.fn().mockResolvedValue(undefined),
      setJson: vi.fn().mockResolvedValue(undefined)
    } as unknown as RedisService;
    const service = new RedisCacheQueueService(redis);
    const notification: Notification = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: "11111111-1111-4111-8111-111111111111",
      notificationType: "TRADE",
      title: "Paper trade executed",
      message: "BUY 5.00 AAPL filled at 200.00",
      status: "UNREAD",
      createdAt: "2026-06-05T00:00:00.000Z"
    };
    const candles: MarketCandle[] = [
      {
        symbol: "AAPL",
        timeframe: "1m",
        timestamp: "2026-06-05T00:00:00.000Z",
        open: 200,
        high: 205,
        low: 198,
        close: 204,
        volume: 1_000_000
      }
    ];

    await service.enqueueNotification(notification);
    await service.cacheMarketData("aapl", "1m", candles);

    expect(redis.rpush).toHaveBeenCalledWith(
      "queue:notifications",
      expect.stringContaining("NOTIFICATION_CREATED")
    );
    expect(redis.setJson).toHaveBeenCalledWith("cache:market:AAPL:1m:candles", candles, 300);
  });
});
