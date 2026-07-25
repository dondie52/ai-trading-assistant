import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { DondieAgent } from "@trading/types";
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
import { dondieConfig } from "../src/dondie/dondie.config.js";

const saturday = new Date("2026-07-25T15:00:00.000Z");
const wednesday = new Date("2026-07-22T15:00:00.000Z");

const createStack = (): {
  readonly dondie: DondieService;
  readonly platform: PlatformService;
  readonly store: PlatformStore;
  readonly wallet: DondieWalletService;
  readonly weekendEarn: DondieWeekendEarnService;
} => {
  process.env.AUTH_PROVIDER = "legacy";
  process.env.DONDIE_SCHEDULER_ENABLED = "false";
  delete process.env.DONDIE_WEEKEND_EARN_ENABLED;
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
  return { dondie, platform, store, wallet, weekendEarn };
};

describe("Dondie weekend paper BTC desk", () => {
  afterEach(() => {
    process.env.DONDIE_WEEKEND_EARN_ENABLED = "false";
    vi.restoreAllMocks();
  });

  it("only opens the earn window on US equity weekends", () => {
    const { weekendEarn } = createStack();
    expect(weekendEarn.isWeekendEarnWindow(saturday)).toBe(true);
    expect(weekendEarn.isWeekendEarnWindow(wednesday)).toBe(false);
    process.env.DONDIE_WEEKEND_EARN_ENABLED = "false";
    expect(weekendEarn.isWeekendEarnWindow(saturday)).toBe(false);
  });

  it("paper-trades BTCUSD, records fills, and caps wallet credits", async () => {
    const { weekendEarn, store, wallet } = createStack();
    const user = store.createUser({
      email: `btc-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Bit",
      lastName: "Coin",
      role: "TRADER"
    });
    const now = saturday.toISOString();
    const agent: DondieAgent = {
      id: randomUUID(),
      userId: user.id,
      name: "Dondie",
      tier: "FREE",
      status: "ACTIVE",
      walletBalance: 0,
      scheduleMinutes: 60,
      symbolUniverse: ["AAPL"],
      createdAt: now,
      updatedAt: now
    };
    store.dondieAgents.set(agent.id, agent);

    const first = await weekendEarn.runWeekendGig(user.id, agent, saturday);
    expect(first.brain).toBe(dondieConfig.weekendEarnBrain);
    expect(first.symbol).toBe("BTCUSD");
    expect(first.automation.status).toBe("EXECUTED");
    expect(first.automation.execution?.trade?.symbol).toBe("BTCUSD");
    expect(first.automation.signal.signalType === "BUY" || first.automation.signal.signalType === "SELL").toBe(
      true
    );
    expect([...store.trades.values()].some((trade) => trade.symbol === "BTCUSD")).toBe(true);

    // Keep scalping until the daily wallet cap binds (or we exhaust attempts).
    for (let index = 0; index < 40; index += 1) {
      const current = store.dondieAgents.get(agent.id)!;
      await weekendEarn.runWeekendGig(current.userId, current, saturday);
    }
    const earned = weekendEarn.creditedToday(agent.id, saturday.toISOString().slice(0, 10));
    expect(earned).toBeGreaterThan(0);
    expect(earned).toBeLessThanOrEqual(dondieConfig.weekendEarnMaxPerDayUsd + 0.0001);
    expect(wallet.listLedger(agent.id).some((entry) => entry.reason === "WEEKEND_CRYPTO_DESK")).toBe(true);
  });

  it("routes runs through paper BTC without polluting the equity universe", async () => {
    const { dondie, platform, store, weekendEarn } = createStack();
    const user = store.createUser({
      email: `weekend-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Week",
      lastName: "End",
      role: "TRADER"
    });
    const strategy = platform.createStrategy(user.id, {
      name: "Weekend strat",
      description: "test",
      version: "1.0.0",
      status: "ACTIVE",
      configuration: { agentManaged: true, confidenceThreshold: 65 }
    });
    await dondie.activate(user.id, { strategyId: strategy.id });
    await dondie.updateSymbolUniverse(user.id, { symbols: ["AAPL", "MSFT"] });
    platform.updateAutomationSettings(user.id, { mode: "AUTOPILOT", emergencyStop: false });

    vi.spyOn(weekendEarn, "isWeekendEarnWindow").mockReturnValue(true);
    const result = await dondie.run(user.id, {});

    expect(result.brain).toBe("weekend-crypto-desk");
    expect(result.symbol).toBe("BTCUSD");
    expect(result.automation.status).toBe("EXECUTED");
    const refreshed = dondie.requireAgent(user.id);
    expect(refreshed.symbolUniverse).toEqual(["AAPL", "MSFT"]);
    expect(refreshed.symbolUniverse).not.toContain("BTCUSD");
    expect(dondie.listMemories(user.id)[0]?.evaluation.weekendGig).toBe(true);
    expect(platform.listTrades(user.id).some((trade) => trade.symbol === "BTCUSD")).toBe(true);
  });
});
