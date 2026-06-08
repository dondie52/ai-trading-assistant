import { Inject, Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service.js";

export interface RedisHealth {
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly status: "not_configured" | "ok" | "error";
}

@Injectable()
export class RedisHealthService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async check(): Promise<RedisHealth> {
    if (!this.redis.isConfigured()) {
      return {
        configured: false,
        reachable: false,
        status: "not_configured"
      };
    }

    try {
      await this.redis.ping();
      return {
        configured: true,
        reachable: true,
        status: "ok"
      };
    } catch {
      return {
        configured: true,
        reachable: false,
        status: "error"
      };
    }
  }
}
