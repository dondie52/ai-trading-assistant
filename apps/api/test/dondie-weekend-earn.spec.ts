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

const fundMicroStake = (store: PlatformStore, userId: string, cash = 10): void => {
  const portfolio = [...store.portfolios.values()].find((entry) => entry.userId === userId);
  if (!portfolio) {
    return;
  }
  store.portfolios.set(portfolio.id, {
    ...portfolio,
    cashBalance: cash,
    portfolioValue: cash
  });
};

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

  it("keeps BUY win rate near the FREE tier chance (no side/outcome salt coupling)", async () => {
    const { weekendEarn, store } = createStack();
    let buyWins = 0;
    let buyTotal = 0;
    let sellWins = 0;
    let sellTotal = 0;

    for (let sample = 0; sample < 80; sample += 1) {
      const user = store.createUser({
        email: `salt-${sample}-${randomUUID()}@example.com`,
        passwordHash: "hash",
        firstName: "Salt",
        lastName: "Test",
        role: "TRADER"
      });
      fundMicroStake(store, user.id, 10);
      const day = new Date(Date.UTC(2026, 6, 25 + (sample % 2), 15, 0, 0));
      const now = day.toISOString();
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

      for (let run = 0; run < 5; run += 1) {
        const current = store.dondieAgents.get(agent.id)!;
        const result = await weekendEarn.runWeekendGig(user.id, current, day);
        const trade = result.automation.execution?.trade;
        if (!trade) {
          continue;
        }
        const won = (trade.pnl ?? 0) > 0;
        if (trade.side === "BUY") {
          buyTotal += 1;
          if (won) {
            buyWins += 1;
          }
        } else {
          sellTotal += 1;
          if (won) {
            sellWins += 1;
          }
        }
      }
    }

    expect(buyTotal).toBeGreaterThan(80);
    expect(sellTotal).toBeGreaterThan(80);
    // FREE winChance is 0.52. Pre-fix BUY rate collapsed near ~8% because side and
    // outcome shared one salt; require BUY wins in a plausible band around 52%.
    expect(buyWins / buyTotal).toBeGreaterThan(0.35);
    expect(buyWins / buyTotal).toBeLessThan(0.7);
    expect(sellWins / sellTotal).toBeGreaterThan(0.35);
    expect(sellWins / sellTotal).toBeLessThan(0.7);
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
    fundMicroStake(store, user.id, 10);
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
    expect(first.automation.execution?.trade?.quantity ?? 0).toBeGreaterThan(0);
    expect(first.automation.execution?.trade?.quantity ?? 1).toBeLessThan(0.01);
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
    fundMicroStake(store, user.id, 10);
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

  it("includes ASSISTED agents in weekend keepalive due list", async () => {
    const { dondie, platform, store, weekendEarn } = createStack();
    const user = store.createUser({
      email: `due-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Due",
      lastName: "List",
      role: "TRADER"
    });
    fundMicroStake(store, user.id, 10);
    const strategy = platform.createStrategy(user.id, {
      name: "Due list",
      description: "test",
      version: "1.0.0",
      status: "ACTIVE",
      configuration: { agentManaged: true, confidenceThreshold: 65 }
    });
    await dondie.activate(user.id, { strategyId: strategy.id });
    platform.updateAutomationSettings(user.id, { mode: "ASSISTED", emergencyStop: false });
    vi.spyOn(weekendEarn, "isWeekendEarnWindow").mockReturnValue(true);
    expect(dondie.listDueScheduledUserIds()).toContain(user.id);
    await dondie.runScheduled(user.id);
    expect(platform.listTrades(user.id).some((trade) => trade.symbol === "BTCUSD")).toBe(true);
  });

  it("kicks a weekend paper BTC scalp when the office lifestyle is polled", async () => {
    const { dondie, platform, store, weekendEarn } = createStack();
    const user = store.createUser({
      email: `office-${randomUUID()}@example.com`,
      passwordHash: "hash",
      firstName: "Office",
      lastName: "Kick",
      role: "TRADER"
    });
    fundMicroStake(store, user.id, 10);
    const paperId = randomUUID();
    store.brokerAccounts.set(paperId, {
      id: paperId,
      userId: user.id,
      brokerName: "PAPER",
      accountId: `paper-${user.id.slice(0, 8)}`,
      status: "CONNECTED",
      createdAt: new Date().toISOString()
    });
    const strategy = platform.createStrategy(user.id, {
      name: "Office kick",
      description: "test",
      version: "1.0.0",
      status: "ACTIVE",
      configuration: { agentManaged: true, confidenceThreshold: 65 }
    });
    await dondie.activate(user.id, { strategyId: strategy.id });
    // ASSISTED (not only AUTOPILOT) should still earn when the operator opens the office.
    platform.updateAutomationSettings(user.id, { mode: "ASSISTED", emergencyStop: false });
    vi.spyOn(weekendEarn, "isWeekendEarnWindow").mockReturnValue(true);

    const before = platform.listTrades(user.id).length;
    const world = await dondie.getLifestyle(user.id);
    expect(world.activity).toBe("SIDE_HUSTLE");
    expect(platform.listTrades(user.id).length).toBeGreaterThan(before);
    expect(platform.listTrades(user.id).some((trade) => trade.symbol === "BTCUSD")).toBe(true);
  });
});
