import { describe, expect, it, vi } from "vitest";
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
import { DondieMemoryService } from "../src/dondie/dondie-memory.service.js";
import { DondieScheduler } from "../src/dondie/dondie.scheduler.js";
import { DondieWalletService } from "../src/dondie/dondie-wallet.service.js";
import { DondieWeekendEarnService } from "../src/dondie/dondie-weekend-earn.service.js";
import { installAlpacaFetchMock } from "./alpaca-fetch-mock.js";

const ensureTestPaperBroker = (store: PlatformStore, userId: string): void => {
  const existing = [...store.brokerAccounts.values()].find(
    (account) => account.userId === userId && account.brokerName === "PAPER"
  );
  if (existing) {
    return;
  }
  const id = randomUUID();
  store.brokerAccounts.set(id, {
    id,
    userId,
    brokerName: "PAPER",
    accountId: `paper-${userId.slice(0, 8)}`,
    status: "CONNECTED",
    createdAt: new Date().toISOString()
  });
};

const fundPaperPortfolio = (store: PlatformStore, userId: string, amount: number): void => {
  ensureTestPaperBroker(store, userId);
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
  readonly wallet: DondieWalletService;
} => {
  process.env.AUTH_PROVIDER = "legacy";
  process.env.DONDIE_SCHEDULER_ENABLED = "false";
  const prisma = new PrismaService();
  const store = new PlatformStore();
  const repository = new PrismaPlatformRepository(prisma);
  const platform = new PlatformService(
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
  const dondieRepository = new DondieRepository(prisma);
  const freeBrain = new DondieBrainFreeService(platform);
  const llmBrain = new DondieBrainLlmService();
  const brain = new DondieBrainService(platform, freeBrain, llmBrain);
  process.env.DONDIE_WEEKEND_EARN_ENABLED = "false";
  const wallet = new DondieWalletService(store, dondieRepository);
  const memory = new DondieMemoryService(store, dondieRepository);
  const weekendEarn = new DondieWeekendEarnService(wallet, store);
  const dondie = new DondieService(
    store,
    platform,
    dondieRepository,
    brain,
    new DondieScheduler(),
    wallet,
    memory,
    weekendEarn
  );
  return { dondie, platform, store, wallet };
};

describe("Dondie survival loop", () => {
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
    expect(dondie.listMemories(user.id).length).toBeGreaterThan(0);
  });

  it("executes a paper trade from a BUY signal without regenerating the signal", async () => {
    installAlpacaFetchMock();
    const { dondie, platform, store } = createDondie();
    const user = store.createUser({
      email: `dondie-exec-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Dondie",
      lastName: "Trader",
      role: "TRADER"
    });
    // No pre-seeded paper broker — ensurePaperBrokerAccount must provision + fund.
    const strategy = platform.createStrategy(user.id, {
      name: "Execute Strategy",
      description: "Must fill paper orders",
      version: "1.0.0",
      status: "ACTIVE",
      configuration: { confidenceThreshold: 1, stopLossPercent: 5, takeProfitPercent: 8 }
    });
    await dondie.activate(user.id, { strategyId: strategy.id });
    platform.updateAutomationSettings(user.id, {
      mode: "AUTOPILOT",
      emergencyStop: false,
      minimumConfidence: 1,
      marketHoursOnly: false,
      cooldownSeconds: 0
    });

    const signal = {
      id: randomUUID(),
      userId: user.id,
      strategyId: strategy.id,
      symbol: "AAPL",
      signalType: "BUY" as const,
      confidenceScore: 88,
      modelVersion: "mvp-baseline-1.0.0",
      features: { latestClose: 190 },
      generatedAt: new Date().toISOString()
    };
    store.signals.set(signal.id, signal);
    const generateSpy = vi.spyOn(platform, "generateTradingSignal").mockResolvedValue(signal);

    const result = await dondie.run(user.id, { symbol: "AAPL" });
    expect(result.automation.status).toBe("EXECUTED");
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(platform.listTrades(user.id).length).toBeGreaterThan(0);
    expect(platform.listPositions(user.id).some((position) => position.symbol === "AAPL")).toBe(true);
    expect(platform.getPrimaryPortfolio(user.id).cashBalance).toBeLessThan(100_000);
  });

  it("exposes wallet ledger after credits", async () => {
    const { dondie, platform, store, wallet } = createDondie();
    const user = store.createUser({
      email: `dondie-wallet-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Dondie",
      lastName: "Trader",
      role: "TRADER"
    });
    const strategy = platform.createStrategy(user.id, {
      name: "Wallet Strategy",
      description: "Wallet test",
      version: "1.0.0",
      status: "ACTIVE",
      configuration: { confidenceThreshold: 50, stopLossPercent: 5, takeProfitPercent: 8 }
    });
    const agent = await dondie.activate(user.id, { strategyId: strategy.id });
    await wallet.credit(agent, 30, "TEST_GRANT");
    const walletView = dondie.getWallet(user.id);
    expect(walletView.balance).toBe(30);
    expect(walletView.tier).toBe("STANDARD");
    expect(walletView.ledger).toHaveLength(1);
  });

  it("builds lifestyle world even when risk rules were missing from memory", async () => {
    const { dondie, platform, store } = createDondie();
    const user = store.createUser({
      email: `dondie-lifestyle-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Dondie",
      lastName: "Trader",
      role: "TRADER"
    });
    const strategy = platform.createStrategy(user.id, {
      name: "Lifestyle Strategy",
      description: "Lifestyle test",
      version: "1.0.0",
      status: "ACTIVE",
      configuration: { confidenceThreshold: 50, stopLossPercent: 5, takeProfitPercent: 8 }
    });
    await dondie.activate(user.id, { strategyId: strategy.id });

    for (const [id, rules] of [...store.riskRules.entries()]) {
      if (rules.userId === user.id) {
        store.riskRules.delete(id);
      }
    }

    const world = await dondie.getLifestyle(user.id);
    expect(world.lifestyleLevel).toBe(1);
    expect(world.activity).toBeTruthy();
    expect(world.currentTask.length).toBeGreaterThan(0);
    expect([...store.riskRules.values()].some((rules) => rules.userId === user.id)).toBe(true);
  });
});
