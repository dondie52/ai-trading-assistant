import { afterEach, describe, expect, it } from "vitest";
import { PaperBrokerAdapter } from "../src/brokers/paper-broker.adapter.js";
import { AlpacaBrokerAdapter } from "../src/brokers/alpaca-broker.adapter.js";
import { BrokerCredentialService } from "../src/brokers/broker-credential.service.js";
import { PrismaAuditSink } from "../src/audit/prisma-audit.sink.js";
import { DatabaseHealthService } from "../src/infrastructure/database-health.service.js";
import { PrismaPlatformRepository } from "../src/infrastructure/prisma-platform.repository.js";
import { PrismaService } from "../src/infrastructure/prisma.service.js";
import { SupabaseCacheQueueService } from "../src/infrastructure/supabase-cache-queue.service.js";
import { PlatformService } from "../src/platform.service.js";
import { PlatformStore } from "../src/store/platform.store.js";
import { TokenService } from "../src/auth/token.service.js";
import { MfaService } from "../src/auth/mfa.service.js";
import { SessionActivityService } from "../src/auth/session-activity.service.js";
import { SupabaseAdminService } from "../src/auth/supabase-admin.service.js";
import { RealtimeEventBus } from "../src/realtime/realtime-event-bus.js";
import { OperationalMetricsService } from "../src/monitoring/operational-metrics.service.js";

const createPlatform = (): PlatformService => {
  process.env.AUTH_PROVIDER = "legacy";
  delete process.env.ALPACA_API_KEY;
  delete process.env.ALPACA_SECRET_KEY;
  const prisma = new PrismaService();
  const store = new PlatformStore();
  const repository = new PrismaPlatformRepository(prisma);
  return new PlatformService(
    store,
    new TokenService(),
    new MfaService(),
    new PaperBrokerAdapter(),
    new AlpacaBrokerAdapter(),
    new BrokerCredentialService(),
    new SessionActivityService(store, repository),
    new DatabaseHealthService(prisma),
    new PrismaAuditSink(prisma),
    repository,
    new SupabaseCacheQueueService(prisma),
    new OperationalMetricsService(),
    new RealtimeEventBus(),
    new SupabaseAdminService()
  );
};

describe("simulated market data fallback", () => {
  afterEach(() => {
    delete process.env.ENABLE_E2E_SEED;
    delete process.env.NODE_ENV;
  });

  it("serves simulated candles and quotes when e2e seed mode is enabled", async () => {
    process.env.ENABLE_E2E_SEED = "true";
    process.env.NODE_ENV = "test";
    const platform = createPlatform();
    const candles = await platform.listMarketData(undefined, "AAPL", "1h");
    expect(candles.length).toBeGreaterThanOrEqual(220);
    expect(candles[0]?.symbol).toBe("AAPL");

    const quote = await platform.getMarketQuote(undefined, "AAPL", "1h");
    expect(quote.source).toBe("SIMULATED");
    expect(quote.price).toBeGreaterThan(0);
  });

  it("rejects market data when simulation is disabled and Alpaca is missing", async () => {
    delete process.env.ENABLE_E2E_SEED;
    process.env.NODE_ENV = "production";
    const platform = createPlatform();
    await expect(platform.listMarketData(undefined, "AAPL", "1h")).rejects.toMatchObject({
      response: { code: "BROKER_NOT_CONNECTED" }
    });
    await expect(platform.getMarketQuote(undefined, "AAPL", "1h")).rejects.toMatchObject({
      response: { code: "BROKER_NOT_CONNECTED" }
    });
  });
});
