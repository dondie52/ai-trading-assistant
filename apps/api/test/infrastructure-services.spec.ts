import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseHealthService } from "../src/infrastructure/database-health.service.js";
import type { PrismaService } from "../src/infrastructure/prisma.service.js";
import { RedisHealthService } from "../src/infrastructure/redis-health.service.js";
import { RedisService } from "../src/infrastructure/redis.service.js";

const listen = async (
  responder: (request: string) => string
): Promise<{ readonly server: Server; readonly port: number; readonly requests: string[] }> => {
  const requests: string[] = [];
  const server = createServer((socket) => {
    socket.once("data", (chunk) => {
      const request = chunk.toString();
      requests.push(request);
      socket.write(responder(request));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test Redis server did not bind to a TCP port.");
  }
  return { server, port: address.port, requests };
};

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

describe("infrastructure service boundaries", () => {
  const previousRedisUrl = process.env.REDIS_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const servers: Server[] = [];

  afterEach(async () => {
    if (previousRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = previousRedisUrl;
    }
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    await Promise.all(servers.splice(0).map(close));
    vi.restoreAllMocks();
  });

  it("encodes authenticated Redis commands, selects a database, and stores queue/cache data", async () => {
    const fakeRedis = await listen(() => "+OK\r\n");
    servers.push(fakeRedis.server);
    process.env.REDIS_URL = `redis://:secret@127.0.0.1:${fakeRedis.port}/2`;
    const redis = new RedisService();

    expect(redis.isConfigured()).toBe(true);
    await redis.ping();
    await redis.rpush("queue:test", "payload");
    await redis.setJson("cache:test", { value: 42 }, 300);

    expect(fakeRedis.requests).toHaveLength(3);
    expect(fakeRedis.requests[0]).toContain("AUTH");
    expect(fakeRedis.requests[0]).toContain("secret");
    expect(fakeRedis.requests[0]).toContain("SELECT");
    expect(fakeRedis.requests[0]).toContain("PING");
    expect(fakeRedis.requests[1]).toContain("RPUSH");
    expect(fakeRedis.requests[2]).toContain("\"value\":42");
    expect(fakeRedis.requests[2]).toContain("300");
  });

  it("reads Redis queue depth from an integer response", async () => {
    const fakeRedis = await listen(() => ":7\r\n");
    servers.push(fakeRedis.server);
    process.env.REDIS_URL = `redis://127.0.0.1:${fakeRedis.port}`;
    const redis = new RedisService();

    await expect(redis.llen("queue:notifications")).resolves.toBe(7);
    expect(fakeRedis.requests[0]).toContain("LLEN");
    expect(fakeRedis.requests[0]).toContain("queue:notifications");
  });

  it("treats Redis protocol errors and connection failures as unavailable", async () => {
    const fakeRedis = await listen(() => "-ERR command failed\r\n");
    servers.push(fakeRedis.server);
    process.env.REDIS_URL = `redis://127.0.0.1:${fakeRedis.port}`;
    const redis = new RedisService();

    await expect(redis.ping()).rejects.toThrow("Redis command failed");
    await close(fakeRedis.server);
    servers.splice(servers.indexOf(fakeRedis.server), 1);
    await expect(redis.ping()).rejects.toBeInstanceOf(Error);
  });

  it("uses no-op Redis writes when no server is configured", async () => {
    delete process.env.REDIS_URL;
    const redis = new RedisService();
    expect(redis.isConfigured()).toBe(false);
    await expect(redis.ping()).resolves.toBeUndefined();
    await expect(redis.rpush("queue", "value")).resolves.toBeUndefined();
    await expect(redis.setJson("cache", {}, 60)).resolves.toBeUndefined();
    await expect(redis.llen("queue")).resolves.toBeNull();
  });

  it("reports database and Redis configured success and failure states", async () => {
    process.env.DATABASE_URL = "postgresql://configured";
    process.env.REDIS_URL = "redis://configured";
    const queryRaw = vi.fn().mockResolvedValueOnce([{ "?column?": 1 }]).mockRejectedValueOnce(new Error("down"));
    const database = new DatabaseHealthService({
      client: () => ({ $queryRaw: queryRaw })
    } as unknown as PrismaService);
    const ping = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("down"));
    const redis = new RedisHealthService({
      isConfigured: () => true,
      ping
    } as unknown as RedisService);

    await expect(database.check()).resolves.toMatchObject({ configured: true, reachable: true, status: "ok" });
    await expect(database.check()).resolves.toMatchObject({ configured: true, reachable: false, status: "error" });
    await expect(redis.check()).resolves.toMatchObject({ configured: true, reachable: true, status: "ok" });
    await expect(redis.check()).resolves.toMatchObject({ configured: true, reachable: false, status: "error" });
  });
});
