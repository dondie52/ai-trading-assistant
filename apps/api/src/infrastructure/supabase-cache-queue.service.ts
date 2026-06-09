import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { MarketCandle, MarketTimeframe, Notification } from "@trading/types";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class SupabaseCacheQueueService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
  }

  async enqueueNotification(notification: Notification): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.prisma.client().notificationQueueItem.create({
      data: {
        notificationId: notification.id,
        userId: notification.userId,
        payload: {
          type: "NOTIFICATION_CREATED",
          notificationId: notification.id,
          userId: notification.userId,
          notificationType: notification.notificationType,
          title: notification.title,
          message: notification.message,
          createdAt: notification.createdAt
        }
      }
    });
  }

  async getNotificationQueueDepth(): Promise<number | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      return await this.prisma.client().notificationQueueItem.count({
        where: { processedAt: null }
      });
    } catch {
      return null;
    }
  }

  async cacheMarketData(
    symbol: string,
    timeframe: MarketTimeframe,
    candles: readonly MarketCandle[]
  ): Promise<void> {
    if (!this.isConfigured() || candles.length === 0) {
      return;
    }

    const normalizedSymbol = symbol.toUpperCase();
    const cacheKey = `${normalizedSymbol}:${timeframe}:candles`;
    const expiresAt = new Date(Date.now() + 300_000);
    const serializedCandles = candles as unknown as Prisma.InputJsonValue;

    await this.prisma.client().marketDataCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        symbol: normalizedSymbol,
        timeframe,
        candles: serializedCandles,
        expiresAt
      },
      update: {
        candles: serializedCandles,
        expiresAt
      }
    });
  }
}
