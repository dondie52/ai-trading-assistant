import { Inject, Injectable } from "@nestjs/common";
import type { MarketCandle, MarketTimeframe, Notification } from "@trading/types";
import { RedisService } from "./redis.service.js";

@Injectable()
export class RedisCacheQueueService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async enqueueNotification(notification: Notification): Promise<void> {
    if (!this.redis.isConfigured()) {
      return;
    }

    await this.redis.rpush(
      "queue:notifications",
      JSON.stringify({
        type: "NOTIFICATION_CREATED",
        notificationId: notification.id,
        userId: notification.userId,
        notificationType: notification.notificationType,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt
      })
    );
  }

  isConfigured(): boolean {
    return this.redis.isConfigured();
  }

  async getNotificationQueueDepth(): Promise<number | null> {
    try {
      return await this.redis.llen("queue:notifications");
    } catch {
      return null;
    }
  }

  async cacheMarketData(
    symbol: string,
    timeframe: MarketTimeframe,
    candles: readonly MarketCandle[]
  ): Promise<void> {
    if (!this.redis.isConfigured() || candles.length === 0) {
      return;
    }

    await this.redis.setJson(`cache:market:${symbol.toUpperCase()}:${timeframe}:candles`, candles, 300);
  }
}
