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
import { DondieMemoryService } from "../src/dondie/dondie-memory.service.js";
import { DondieScheduler } from "../src/dondie/dondie.scheduler.js";
import { SchedulerStatusService, TradeActivityService } from "../src/dondie/trade-activity.service.js";
import { DondieWalletService } from "../src/dondie/dondie-wallet.service.js";
import { DondieWeekendEarnService } from "../src/dondie/dondie-weekend-earn.service.js";
import { AutonomousBootstrapService } from "../src/dondie/autonomous-bootstrap.service.js";
import { selectAgentStrategyTemplate } from "../src/dondie/agent-strategy-catalog.js";

const createHarness = (): {
  readonly bootstrap: AutonomousBootstrapService;
  readonly platform: PlatformService;
  readonly dondie: DondieService;
  readonly store: PlatformStore;
  readonly userId: string;
} => {
  process.env.AUTH_PROVIDER = "legacy";
  process.env.DONDIE_SCHEDULER_ENABLED = "false";
  process.env.DONDIE_FULL_POWER = "false";
  process.env.DONDIE_NFP_ONLY = "false";
  delete process.env.DONDIE_LLM_API_KEY;
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
  const schedulerStatus = new SchedulerStatusService();
  const activities = new TradeActivityService(store);
  const dondie = new DondieService(
    store,
    platform,
    dondieRepository,
    brain,
    new DondieScheduler(schedulerStatus),
    wallet,
    memory,
    weekendEarn,
    activities,
    schedulerStatus
  );
  const bootstrap = new AutonomousBootstrapService(platform, dondie);
  const user = store.createUser({
    email: `auto-${randomUUID().slice(0, 8)}@example.com`,
    firstName: "Auto",
    lastName: "Nomous",
    role: "TRADER",
    passwordHash: "x"
  });
  return { bootstrap, platform, dondie, store, userId: user.id };
};

describe("selectAgentStrategyTemplate", () => {
  it("picks conservative for small equity", () => {
    expect(selectAgentStrategyTemplate(1_000).id).toBe("conservative_swing");
  });

  it("picks momentum for mid equity", () => {
    expect(selectAgentStrategyTemplate(10_000).id).toBe("momentum");
  });

  it("picks trend for larger equity", () => {
    expect(selectAgentStrategyTemplate(30_000).id).toBe("trend_following");
  });

  it("switches to mean reversion after weak evaluations", () => {
    expect(selectAgentStrategyTemplate(30_000, 25).id).toBe("mean_reversion");
  });
});

describe("AutonomousBootstrapService", () => {
  it("provisions strategy, AUTOPILOT, risk, universe, and activates Dondie", async () => {
    const { bootstrap, platform, dondie, store, userId } = createHarness();
    const portfolio = [...store.portfolios.values()].find((entry) => entry.userId === userId)!;
    store.portfolios.set(portfolio.id, {
      ...portfolio,
      cashBalance: 12_000,
      portfolioValue: 12_000
    });

    const result = await bootstrap.ensureAutonomousMode(userId);

    expect(result.automationMode).toBe("AUTOPILOT");
    expect(result.agentStatus).toBe("ACTIVE");
    expect(result.strategyTemplate).toBe("momentum");
    expect(result.watchlist).toContain("AAPL");
    expect(result.capitalGuidance.alpacaDashboardUrl).toContain("alpaca");
    expect(result.alreadyBootstrapped).toBe(false);

    const automation = platform.getAutomationSettings(userId);
    expect(automation.mode).toBe("AUTOPILOT");
    expect(automation.emergencyStop).toBe(false);
    expect(automation.requireConfirmationAboveValue).toBeGreaterThan(1_000_000);

    const agent = dondie.getAgent(userId);
    expect(agent?.status).toBe("ACTIVE");
    expect(agent?.strategyId).toBe(result.strategyId);
    expect(agent?.symbolUniverse.length).toBeGreaterThan(0);

    const risk = platform.getRiskRules(userId);
    expect(risk.maxPositionSizePercent).toBe(15);
    expect(risk.stopTrading).toBe(false);

    const again = await bootstrap.ensureAutonomousMode(userId);
    expect(again.alreadyBootstrapped).toBe(true);
    expect(again.strategyId).toBe(result.strategyId);
  });

  it("resumes a paused agent when going autonomous", async () => {
    const { bootstrap, dondie, userId } = createHarness();
    await bootstrap.ensureAutonomousMode(userId);
    await dondie.pause(userId);
    expect(dondie.getAgent(userId)?.status).toBe("PAUSED");

    const result = await bootstrap.ensureAutonomousMode(userId);
    expect(result.agentStatus).toBe("ACTIVE");
    expect(dondie.getAgent(userId)?.status).toBe("ACTIVE");
  });

  it("restores AUTOPILOT after in-memory automation settings are cleared", async () => {
    const { bootstrap, platform, store, userId } = createHarness();
    await bootstrap.ensureAutonomousMode(userId);
    store.automationSettings.delete(userId);

    const restored = platform.getAutomationSettings(userId);
    expect(restored.mode).toBe("AUTOPILOT");
    expect(restored.runtimeState).toBe("RUNNING");
    expect(platform.hasHandsOffAgent(userId)).toBe(true);
  });

  it("full power lets Dondie own strategy gates and unlocks PRO cognition wallet", async () => {
    process.env.DONDIE_FULL_POWER = "true";
    process.env.DONDIE_LLM_API_KEY = "test-key-full-power";
    process.env.DONDIE_SCHEDULE_MINUTES = "15";
    const { bootstrap, platform, dondie, store, userId } = createHarness();
    process.env.DONDIE_FULL_POWER = "true";
    process.env.DONDIE_LLM_API_KEY = "test-key-full-power";
    process.env.DONDIE_SCHEDULE_MINUTES = "15";
    const portfolio = [...store.portfolios.values()].find((entry) => entry.userId === userId)!;
    store.portfolios.set(portfolio.id, {
      ...portfolio,
      cashBalance: 12_000,
      portfolioValue: 12_000
    });

    const result = await bootstrap.ensureAutonomousMode(userId);
    const automation = platform.getAutomationSettings(userId);
    const agent = dondie.getAgent(userId);

    expect(result.automationMode).toBe("AUTOPILOT");
    expect(automation.maxTradesPerDay).toBe(20);
    expect(automation.minimumConfidence).toBeLessThanOrEqual(55);
    expect(agent?.tier).toBe("PRO");
    expect(agent?.walletBalance).toBeGreaterThanOrEqual(100);
    expect(agent?.scheduleMinutes).toBe(15);

    // Weak score → Dondie re-chooses mean reversion on the next full-power sync/run path.
    const scored = {
      ...agent!,
      lastEvaluationScore: 20,
      updatedAt: new Date().toISOString()
    };
    store.dondieAgents.set(scored.id, scored);
    await dondie.runScheduled(userId);
    const strategy = platform.listStrategies(userId).find((entry) => entry.configuration.agentManaged === true);
    expect(strategy?.configuration.templateId).toBe("mean_reversion");
  });
});
