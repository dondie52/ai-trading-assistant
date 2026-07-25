import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  DondieAgent,
  DondieLifestyleWorld,
  DondieMemory,
  DondieRunResult,
  JsonObject,
  MarketTimeframe,
  UUID
} from "@trading/types";
import { buildDondieLifestyleWorld, isUsEquityMarketOpen, isUsEquityWeekend } from "@trading/shared";
import { PlatformService } from "../platform.service.js";
import { PlatformStore } from "../store/platform.store.js";
import { DEFAULT_AUTONOMOUS_UNIVERSE } from "./agent-strategy-catalog.js";
import { DondieBrainService } from "./dondie-brain.service.js";
import { dondieConfig } from "./dondie.config.js";
import { DondieMemoryService } from "./dondie-memory.service.js";
import { DondieRepository } from "./dondie.repository.js";
import { DondieScheduler } from "./dondie.scheduler.js";
import { DondieWalletService } from "./dondie-wallet.service.js";
import { DondieWeekendEarnService } from "./dondie-weekend-earn.service.js";

const isoNow = (): string => new Date().toISOString();

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Request body must be an object." });
  }
  return value as Record<string, unknown>;
};

const readString = (body: Record<string, unknown>, key: string, required = false): string => {
  const value = body[key];
  if (value === undefined || value === null) {
    if (required) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} is required.` });
    }
    return "";
  }
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} must be a string.` });
  }
  return value.trim();
};

const errorMessage = (error: unknown): string => {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "string" && response.trim()) {
      return response;
    }
    if (typeof response === "object" && response !== null) {
      const message = (response as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
      if (Array.isArray(message)) {
        return message.map(String).join(", ");
      }
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "unknown error";
};

@Injectable()
export class DondieService implements OnModuleInit {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(DondieRepository) private readonly repository: DondieRepository,
    @Inject(DondieBrainService) private readonly brain: DondieBrainService,
    @Inject(DondieScheduler) private readonly scheduler: DondieScheduler,
    @Inject(DondieWalletService) private readonly wallet: DondieWalletService,
    @Inject(DondieMemoryService) private readonly memory: DondieMemoryService,
    @Inject(DondieWeekendEarnService) private readonly weekendEarn: DondieWeekendEarnService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.hydrate(this.store);
    // Re-hydrate in-memory AUTOPILOT for persisted hands-off agents after restarts.
    for (const agent of this.store.dondieAgents.values()) {
      if (agent.status !== "ACTIVE" || !agent.strategyId) {
        continue;
      }
      const strategy = this.store.strategies.get(agent.strategyId);
      if (!strategy || strategy.configuration.agentManaged !== true) {
        continue;
      }
      this.platform.updateAutomationSettings(agent.userId, {
        mode: "AUTOPILOT",
        emergencyStop: false,
        watchlist:
          agent.symbolUniverse.length > 0
            ? [...agent.symbolUniverse]
            : [...DEFAULT_AUTONOMOUS_UNIVERSE],
        requireConfirmationAboveValue: 1_000_000_000
      });
    }
    this.scheduler.start(
      (scheduledUserId) => this.runScheduled(scheduledUserId),
      () => this.listDueScheduledUserIds()
    );
  }

  /** Wake path for external cron/keepalive — runs overdue AUTOPILOT agents. */
  async tickDueAgents(): Promise<{
    readonly attempted: number;
    readonly succeeded: number;
    readonly failed: number;
  }> {
    return this.scheduler.tickNow();
  }

  getAgent(userId: UUID): DondieAgent | undefined {
    return [...this.store.dondieAgents.values()].find((agent) => agent.userId === userId);
  }

  listMemories(userId: UUID): readonly DondieMemory[] {
    const agent = this.requireAgent(userId);
    return this.memory.listMemories(agent.id);
  }

  async updateSymbolUniverse(userId: UUID, bodyValue: unknown): Promise<DondieAgent> {
    const agent = this.requireAgent(userId);
    const body = asRecord(bodyValue);
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.filter((value): value is string => typeof value === "string")
      : [];
    return this.memory.updateSymbolUniverse(userId, agent, symbols);
  }

  getWallet(userId: UUID): {
    readonly balance: number;
    readonly tier: DondieAgent["tier"];
    readonly ledger: ReturnType<DondieWalletService["listLedger"]>;
  } {
    const agent = this.requireAgent(userId);
    return {
      balance: agent.walletBalance,
      tier: agent.tier,
      ledger: this.wallet.listLedger(agent.id)
    };
  }

  getLifestyle(userId: UUID): DondieLifestyleWorld {
    const agent = this.getAgent(userId) ?? null;
    const trades = this.platform.listTrades(userId);
    const orders = this.platform.listOrders(userId);
    const risk = this.platform.getRiskRules(userId);
    const automation = this.platform.getAutomationSettings(userId);
    const brokers = this.platform.listBrokerAccounts(userId);
    const brokerConnected = brokers.some(
      (account) => account.status === "CONNECTED" && (account.hasCredentials || account.brokerName === "PAPER")
    );
    const signals = this.platform.listSignals(userId);
    const latestSignal = signals[signals.length - 1];
    const positions = this.platform.listPositions(userId);
    const completedRuns = agent
      ? this.memory.listMemories(agent.id).length
      : 0;
    const paperMode = !brokers.some((account) => account.environment === "LIVE" && account.hasCredentials);
    const recentWeekendGig = agent
      ? this.memory
          .listMemories(agent.id)
          .some(
            (memory) =>
              memory.evaluation.weekendGig === true &&
              Date.now() - Date.parse(memory.createdAt) < 2 * 60 * 60 * 1000
          )
      : false;

    return buildDondieLifestyleWorld({
      agent,
      trades,
      orders,
      completedRuns,
      brokerConnected,
      riskLocked: risk.stopTrading || automation.emergencyStop || automation.runtimeState === "RISK_LOCK",
      automationPaused: agent?.status === "PAUSED" || automation.mode === "MANUAL" || automation.runtimeState === "PAUSED",
      marketOpen: isUsEquityMarketOpen() && automation.runtimeState !== "WAITING_FOR_MARKET",
      weekendSideHustle: recentWeekendGig || (isUsEquityWeekend() && agent?.status === "ACTIVE"),
      ...(latestSignal?.symbol && latestSignal.symbol !== dondieConfig.weekendEarnSymbol
        ? { recentSignalSymbol: latestSignal.symbol }
        : {}),
      hasOpenPositions: positions.some((position) => position.quantity !== 0),
      paperMode,
      isExecuting: automation.runtimeState === "RUNNING" && automation.mode === "AUTOPILOT"
    });
  }

  requireAgent(userId: UUID): DondieAgent {
    const agent = this.getAgent(userId);
    if (!agent) {
      throw new NotFoundException({ code: "DONDIE_NOT_FOUND", message: "Activate Dondie before using this feature." });
    }
    return agent;
  }

  async activate(userId: UUID, bodyValue: unknown): Promise<DondieAgent> {
    const existing = this.getAgent(userId);
    if (existing) {
      return existing;
    }
    const body = asRecord(bodyValue);
    const strategyId = readString(body, "strategyId", true);
    const strategy = this.store.strategies.get(strategyId);
    if (!strategy || strategy.userId !== userId) {
      throw new BadRequestException({ code: "STRATEGY_NOT_FOUND", message: "Strategy was not found." });
    }
    const now = isoNow();
    const agent: DondieAgent = {
      id: randomUUID(),
      userId,
      name: dondieConfig.name,
      tier: "FREE",
      status: "ACTIVE",
      walletBalance: 0,
      strategyId,
      scheduleMinutes: dondieConfig.defaultScheduleMinutes,
      symbolUniverse: [],
      createdAt: now,
      updatedAt: now
    };
    this.store.dondieAgents.set(agent.id, agent);
    await this.repository.persistAgent(agent);
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "DONDIE_ACTIVATED",
      entityType: "DONDIE_AGENT",
      entityId: agent.id,
      metadata: { tier: agent.tier, strategyId }
    });
    return agent;
  }

  /** Activate or resume Dondie and keep strategy linked for hands-off mode. */
  async ensureActiveWithStrategy(userId: UUID, strategyId: UUID): Promise<DondieAgent> {
    const strategy = this.store.strategies.get(strategyId);
    if (!strategy || strategy.userId !== userId) {
      throw new BadRequestException({ code: "STRATEGY_NOT_FOUND", message: "Strategy was not found." });
    }

    const existing = this.getAgent(userId);
    if (!existing) {
      return this.activate(userId, { strategyId });
    }

    let updated: DondieAgent = existing;
    if (existing.strategyId !== strategyId) {
      updated = { ...existing, strategyId, updatedAt: isoNow() };
      this.store.dondieAgents.set(updated.id, updated);
      await this.repository.persistAgent(updated);
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "DONDIE_STRATEGY_LINKED",
        entityType: "DONDIE_AGENT",
        entityId: updated.id,
        metadata: { strategyId }
      });
    }

    if (updated.status !== "ACTIVE") {
      return this.resume(userId);
    }
    return updated;
  }

  async pause(userId: UUID): Promise<DondieAgent> {
    return this.updateStatus(userId, "PAUSED");
  }

  async resume(userId: UUID): Promise<DondieAgent> {
    return this.updateStatus(userId, "ACTIVE");
  }

  private async updateStatus(userId: UUID, status: DondieAgent["status"]): Promise<DondieAgent> {
    const agent = this.requireAgent(userId);
    const updated: DondieAgent = { ...agent, status, updatedAt: isoNow() };
    this.store.dondieAgents.set(agent.id, updated);
    await this.repository.persistAgent(updated);
    return updated;
  }

  async run(userId: UUID, bodyValue: unknown = {}): Promise<DondieRunResult> {
    const agent = this.requireAgent(userId);
    if (agent.status !== "ACTIVE") {
      throw new BadRequestException({ code: "DONDIE_PAUSED", message: "Dondie is paused." });
    }
    if (!agent.strategyId) {
      throw new BadRequestException({ code: "DONDIE_STRATEGY_REQUIRED", message: "Link a strategy to Dondie." });
    }

    const body = asRecord(bodyValue);
    const timeframe = (readString(body, "timeframe") || "1h") as MarketTimeframe;
    const requestedSymbol = readString(body, "symbol");

    // No symbol from the human → agent scans its own universe.
    if (!requestedSymbol) {
      return this.runUniverseScan(userId, agent, timeframe);
    }

    return this.runForSymbol(userId, agent, requestedSymbol.toUpperCase(), timeframe);
  }

  async runScheduled(userId: UUID): Promise<void> {
    const agent = this.getAgent(userId);
    if (!agent || agent.status !== "ACTIVE") {
      return;
    }
    const settings = this.platform.getAutomationSettings(userId);
    if (settings.mode !== "AUTOPILOT" || settings.emergencyStop) {
      return;
    }
    try {
      if (this.weekendEarn.isWeekendEarnWindow()) {
        await this.runWeekendSideHustle(userId, agent);
        return;
      }
      await this.runUniverseScan(userId, agent, "1h");
    } catch (error) {
      // Advance lastRunAt + audit so silent schedule failures are visible and not tight-looped.
      const now = isoNow();
      const updated: DondieAgent = { ...agent, lastRunAt: now, updatedAt: now };
      this.store.dondieAgents.set(agent.id, updated);
      await this.repository.persistAgent(updated);
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "DONDIE_RUN",
        entityType: "DONDIE_AGENT",
        entityId: agent.id,
        metadata: {
          scheduled: true,
          automationStatus: "SKIPPED",
          error: errorMessage(error)
        }
      });
      const memory = {
        id: randomUUID(),
        agentId: agent.id,
        summary: `scheduler skipped on UNIVERSE: ${errorMessage(error)}`,
        evaluation: {
          scheduled: true,
          automationStatus: "SKIPPED",
          error: errorMessage(error),
          score: 0
        },
        createdAt: now
      };
      this.store.dondieMemories.set(memory.id, memory);
      await this.repository.persistMemory(memory);
    }
  }

  listScheduledUserIds(): readonly UUID[] {
    return [...this.store.dondieAgents.values()]
      .filter((agent) => agent.status === "ACTIVE")
      .map((agent) => agent.userId);
  }

  /** ACTIVE AUTOPILOT agents whose schedule interval has elapsed (or never ran). */
  listDueScheduledUserIds(nowMs: number = Date.now()): readonly UUID[] {
    return [...this.store.dondieAgents.values()]
      .filter((agent) => {
        if (agent.status !== "ACTIVE") {
          return false;
        }
        const settings = this.platform.getAutomationSettings(agent.userId);
        if (settings.mode !== "AUTOPILOT" || settings.emergencyStop) {
          return false;
        }
        const scheduleMinutes = Math.max(1, agent.scheduleMinutes || dondieConfig.defaultScheduleMinutes);
        const scheduleMs = Math.max(60_000, scheduleMinutes * 60_000);
        if (!agent.lastRunAt) {
          return true;
        }
        const last = Date.parse(agent.lastRunAt);
        if (!Number.isFinite(last)) {
          return true;
        }
        return nowMs - last >= scheduleMs;
      })
      .map((agent) => agent.userId);
  }

  private async runWeekendSideHustle(userId: UUID, agent: DondieAgent): Promise<DondieRunResult> {
    const result = await this.weekendEarn.runWeekendGig(userId, agent);
    const credited = this.requireAgent(userId);
    await this.memory.recordRun(credited, result);
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "DONDIE_RUN",
      entityType: "DONDIE_AGENT",
      entityId: agent.id,
      metadata: {
        tier: result.tier,
        symbol: result.symbol,
        brain: result.brain,
        automationStatus: result.automation.status,
        weekendGig: true,
        walletBalance: result.walletBalance
      }
    });
    return result;
  }

  /** Scan the agent-owned universe; human never needs to pick a ticker. */
  private async runUniverseScan(
    userId: UUID,
    agent: DondieAgent,
    timeframe: MarketTimeframe
  ): Promise<DondieRunResult> {
    if (this.weekendEarn.isWeekendEarnWindow()) {
      return this.runWeekendSideHustle(userId, agent);
    }

    const symbols = this.resolveSymbolUniverse(userId, agent);
    const settings = this.platform.getAutomationSettings(userId);
    let tradesRemaining = Math.max(0, settings.maxTradesPerDay - this.countAutoTradesToday(userId));
    let lastResult: DondieRunResult | null = null;
    let workingAgent = agent;
    const failures: string[] = [];

    for (const symbol of symbols) {
      if (tradesRemaining <= 0) {
        break;
      }
      try {
        const result = await this.runForSymbol(userId, workingAgent, symbol, timeframe);
        lastResult = result;
        workingAgent = this.requireAgent(userId);
        if (result.automation.status === "EXECUTED") {
          tradesRemaining -= 1;
        }
      } catch (error) {
        failures.push(`${symbol}: ${errorMessage(error)}`);
      }
    }

    if (lastResult) {
      return lastResult;
    }

    const reason =
      failures.length > 0
        ? `Universe scan found no usable market data (${failures.slice(0, 3).join("; ")}).`
        : "Universe scan completed with no actionable setups.";
    throw new BadRequestException({
      code: "DONDIE_UNIVERSE_UNAVAILABLE",
      message: reason
    });
  }

  private async runForSymbol(
    userId: UUID,
    agent: DondieAgent,
    symbol: string,
    timeframe: MarketTimeframe
  ): Promise<DondieRunResult> {
    if (!agent.strategyId) {
      throw new BadRequestException({ code: "DONDIE_STRATEGY_REQUIRED", message: "Link a strategy to Dondie." });
    }

    let activeAgent = agent;
    let brainRun = await this.brain.plan(userId, activeAgent, agent.strategyId, symbol, timeframe);
    if (brainRun.brain !== "free") {
      const cost =
        activeAgent.tier === "PRO" ? dondieConfig.proBrainCostUsd : dondieConfig.standardBrainCostUsd;
      try {
        activeAgent = await this.wallet.debit(activeAgent, cost, "BRAIN_RUN", { brain: brainRun.brain, symbol });
      } catch {
        brainRun = await this.brain.plan(userId, { ...activeAgent, tier: "FREE" }, agent.strategyId, symbol, timeframe);
      }
    }
    const plan = brainRun.plan;

    // Reuse the brain's signal — never regenerate, or BUY/SELL history can diverge from the trade path.
    const automation =
      plan.action === "EXECUTE"
        ? await this.platform.runAutomation(userId, {
            strategyId: agent.strategyId,
            symbol,
            timeframe,
            signalId: brainRun.signal.id
          })
        : {
            status: "SKIPPED" as const,
            mode: "AUTO" as const,
            strategyId: agent.strategyId,
            symbol,
            signal: brainRun.signal,
            reason: plan.reasoning
          };

    let updatedAgent: DondieAgent = {
      ...activeAgent,
      lastRunAt: isoNow(),
      updatedAt: isoNow()
    };
    if (automation.status === "EXECUTED" && automation.execution?.trade?.pnl) {
      updatedAgent = await this.wallet.creditTradePnl(updatedAgent, automation.execution.trade.pnl, symbol);
    } else {
      this.store.dondieAgents.set(agent.id, updatedAgent);
      await this.repository.persistAgent(updatedAgent);
    }

    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "DONDIE_RUN",
      entityType: "DONDIE_AGENT",
      entityId: agent.id,
      metadata: {
        tier: updatedAgent.tier,
        symbol,
        brain: brainRun.brain,
        plan: plan as unknown as JsonObject,
        automationStatus: automation.status
      }
    });

    const result: DondieRunResult = {
      agentId: agent.id,
      tier: updatedAgent.tier,
      symbol,
      brain: brainRun.brain,
      reasoning: plan.reasoning,
      automation,
      walletBalance: updatedAgent.walletBalance,
      ranAt: updatedAgent.lastRunAt!
    };
    await this.memory.recordRun(updatedAgent, result);
    return result;
  }

  private resolveSymbolUniverse(userId: UUID, agent: DondieAgent): readonly string[] {
    if (agent.symbolUniverse.length > 0) {
      return agent.symbolUniverse;
    }
    const watchlist = [...this.store.watchlists.values()].find((entry) => entry.userId === userId);
    if (watchlist && watchlist.symbols.length > 0) {
      return watchlist.symbols;
    }
    return DEFAULT_AUTONOMOUS_UNIVERSE;
  }

  private countAutoTradesToday(userId: UUID): number {
    const day = new Date().toISOString().slice(0, 10);
    return this.platform
      .listOrders(userId)
      .filter(
        (order) =>
          order.mode === "AUTO" &&
          order.submittedAt.startsWith(day) &&
          order.status !== "REJECTED" &&
          order.status !== "CANCELLED"
      ).length;
  }
}
