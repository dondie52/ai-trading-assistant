import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseHealthService } from "../src/infrastructure/database-health.service.js";
import type { PrismaService } from "../src/infrastructure/prisma.service.js";
import { SupabaseCacheQueueService } from "../src/infrastructure/supabase-cache-queue.service.js";

describe("Supabase infrastructure boundaries", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    vi.restoreAllMocks();
  });

  it("uses no-op queue and cache writes when Supabase is not configured", async () => {
    delete process.env.DATABASE_URL;
    const client = vi.fn();
    const service = new SupabaseCacheQueueService({ client } as unknown as PrismaService);

    expect(service.isConfigured()).toBe(false);
    await expect(service.getNotificationQueueDepth()).resolves.toBeNull();
    await service.cacheMarketData("AAPL", "1m", []);
    expect(client).not.toHaveBeenCalled();
  });

  it("reports Supabase configured success and failure states", async () => {
    process.env.DATABASE_URL = "postgresql://configured";
    const queryRaw = vi.fn().mockResolvedValueOnce([{ "?column?": 1 }]).mockRejectedValueOnce(new Error("down"));
    const database = new DatabaseHealthService({
      client: () => ({ $queryRaw: queryRaw })
    } as unknown as PrismaService);

    await expect(database.check()).resolves.toMatchObject({
      mode: "supabase",
      configured: true,
      reachable: true,
      status: "ok"
    });
    await expect(database.check()).resolves.toMatchObject({
      mode: "supabase",
      configured: true,
      reachable: false,
      status: "error"
    });
  });

  it("marks the database unreachable when the probe exceeds the timeout", async () => {
    process.env.DATABASE_URL = "postgresql://configured";
    const queryRaw = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([{ "?column?": 1 }]), 200);
        })
    );
    const database = new DatabaseHealthService({
      client: () => ({ $queryRaw: queryRaw })
    } as unknown as PrismaService);

    await expect(database.check(20)).resolves.toMatchObject({
      mode: "supabase",
      configured: true,
      reachable: false,
      status: "error"
    });
  });
});

