import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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
import { DondieService } from "../src/dondie/dondie.service.js";
import { DondieRepository } from "../src/dondie/dondie.repository.js";
import { DondieBrainFreeService } from "../src/dondie/dondie-brain-free.service.js";
import { DondieBrainLlmService } from "../src/dondie/dondie-brain-llm.service.js";
import { DondieBrainService } from "../src/dondie/dondie-brain.service.js";
import { DondieScheduler } from "../src/dondie/dondie.scheduler.js";
import { DondieBillingService } from "../src/dondie/dondie-billing.service.js";
import { DondieWalletService } from "../src/dondie/dondie-wallet.service.js";
import { installAlpacaFetchMock } from "./alpaca-fetch-mock.js";

const fundPaperPortfolio = (store: PlatformStore, userId: string, amount: number): void => {
  const portfolio = [...store.portfolios.values()].find((candidate) => candidate.userId === userId);
  if (!portfolio) {
    return;
  }
  store.portfolios.set(portfolio.id, {
    ...portfolio,
    cashBalance: amount,
    portfolioValue: amount
  });
};

const createDondie = (): {
  readonly dondie: DondieService;
  readonly platform: PlatformService;
  readonly store: PlatformStore;
} => {
  process.env.AUTH_PROVIDER = "legacy";
  process.env.DONDIE_SCHEDULER_ENABLED = "false";
  const prisma = new PrismaService();
  const store = new PlatformStore();
  const platformRepository = new PrismaPlatformRepository(prisma);
  const platform = new PlatformService(
    store,
    new TokenService(),
    new MfaService(),
    new PaperBrokerAdapter(),
    new AlpacaBrokerAdapter(),
    new BrokerCredentialService(),
    new SessionActivityService(store, platformRepository),
    new DatabaseHealthService(prisma),
    new PrismaAuditSink(prisma),
    platformRepository,
    new SupabaseCacheQueueService(prisma),
    new OperationalMetricsService(),
    new RealtimeEventBus(),
    new SupabaseAdminService()
  );
  const dondieRepository = new DondieRepository(prisma);
  const freeBrain = new DondieBrainFreeService(platform);
  const llmBrain = new DondieBrainLlmService();
  const brain = new DondieBrainService(platform, freeBrain, llmBrain);
  const wallet = new DondieWalletService(store, dondieRepository);
  const billing = new DondieBillingService(store, dondieRepository, wallet);
  const dondie = new DondieService(
    store,
    platform,
    dondieRepository,
    brain,
    llmBrain,
    new DondieScheduler(),
    wallet,
    billing
  );
  return { dondie, platform, store };
};

describe("Dondie phase 1", () => {
  it("activates on the free tier and runs automation", async () => {
    installAlpacaFetchMock();
    const { dondie, platform, store } = createDondie();
    const user = store.createUser({
      email: `dondie-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Dondie",
      lastName: "Trader",
      role: "TRADER"
    });
    fundPaperPortfolio(store, user.id, 100_000);
    const strategy = platform.createStrategy(user.id, {
      name: "Dondie Strategy",
      description: "Autonomous test strategy",
      version: "1.0.0",
      status: "ACTIVE",
      configuration: { confidenceThreshold: 100, stopLossPercent: 5, takeProfitPercent: 8 }
    });

    const agent = await dondie.activate(user.id, { strategyId: strategy.id });
    expect(agent.tier).toBe("FREE");
    expect(agent.name).toBe("Dondie");

    const result = await dondie.run(user.id, { symbol: "AAPL" });
    expect(result.brain).toBe("free");
    expect(result.automation.symbol).toBe("AAPL");
    expect(store.auditLogs.some((log) => log.action === "DONDIE_RUN")).toBe(true);
  });
});
