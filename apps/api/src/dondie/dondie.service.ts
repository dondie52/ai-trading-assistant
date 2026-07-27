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
  ScanTriggerType,
  SchedulerStatusView,
  TradeActivity,
  UUID
} from "@trading/types";
import { buildDondieLifestyleWorld, classifySkipReason, isUsEquityMarketOpen, isUsEquityWeekend } from "@trading/shared";
import { PlatformService } from "../platform.service.js";
import { PlatformStore } from "../store/platform.store.js";
import {
  DEFAULT_AUTONOMOUS_UNIVERSE,
  isAgentManagedStrategy,
  selectAgentStrategyTemplate
} from "./agent-strategy-catalog.js";
import { DondieBrainService } from "./dondie-brain.service.js";
import { dondieConfig, isDondieFullPower } from "./dondie.config.js";
import { DondieMemoryService } from "./dondie-memory.service.js";
import { DondieRepository } from "./dondie.repository.js";
import { DondieScheduler } from "./dondie.scheduler.js";
import { DondieWalletService } from "./dondie-wallet.service.js";
import { DondieWeekendEarnService } from "./dondie-weekend-earn.service.js";
import { SchedulerStatusService, TradeActivityService } from "./trade-activity.service.js";

const isoNow = (): string => new Date().toISOString();
const roundUsd = (value: number): number => Number(value.toFixed(4));

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
  private readonly weekendHustleInFlight = new Set<UUID>();

  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(DondieRepository) private readonly repository: DondieRepository,
    @Inject(DondieBrainService) private readonly brain: DondieBrainService,
    @Inject(DondieScheduler) private readonly scheduler: DondieScheduler,
    @Inject(DondieWalletService) private readonly wallet: DondieWalletService,
    @Inject(DondieMemoryService) private readonly memory: DondieMemoryService,
    @Inject(DondieWeekendEarnService) private readonly weekendEarn: DondieWeekendEarnService,
    @Inject(TradeActivityService) private readonly activities: TradeActivityService,
    @Inject(SchedulerStatusService) private readonly schedulerStatus: SchedulerStatusService
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
        requireConfirmationAboveValue: 1_000_000_000,
        ...(isDondieFullPower()
          ? {
              maxTradesPerDay: dondieConfig.fullPowerMaxTradesPerDay,
              minimumConfidence: dondieConfig.fullPowerMinConfidence,
              cooldownSeconds: 30
            }
          : {})
      });
      if (isDondieFullPower()) {
        const powered = await this.applyFullPowerSchedule(agent.userId, agent);
        await this.ensureFullPowerAiGrant(powered);
      }
    }
    this.scheduler.start(
      (scheduledUserId) => this.runScheduled(scheduledUserId),
      () => this.listDueScheduledUserIds()
    );
  }

  /** Keep schedule tight when full AI power is enabled. */
  async applyFullPowerSchedule(userId: UUID, agent: DondieAgent): Promise<DondieAgent> {
    if (!isDondieFullPower()) {
      return agent;
    }
    const scheduleMinutes = Math.max(
      1,
      Number(process.env.DONDIE_SCHEDULE_MINUTES ?? dondieConfig.defaultScheduleMinutes)
    );
    if (agent.scheduleMinutes === scheduleMinutes) {
      return agent;
    }
    const updated: DondieAgent = {
      ...agent,
      scheduleMinutes,
      updatedAt: isoNow()
    };
    this.store.dondieAgents.set(updated.id, updated);
    await this.repository.persistAgent(updated);
    return updated;
  }

  /**
   * One-time cognition wallet grant so STANDARD/PRO LLM brains unlock under full power.
   * No-op without DONDIE_FULL_POWER or an LLM API key.
   */
  async ensureFullPowerAiGrant(agent: DondieAgent): Promise<DondieAgent> {
    const llmKey = process.env.DONDIE_LLM_API_KEY ?? dondieConfig.llmApiKey;
    if (!isDondieFullPower() || !llmKey.trim()) {
      return agent;
    }
    const target = Math.max(0, dondieConfig.fullPowerTargetWalletUsd);
    if (!(target > 0) || agent.walletBalance >= target) {
      return agent;
    }
    const alreadyGranted = this.wallet
      .listLedger(agent.id)
      .some((entry) => entry.reason === dondieConfig.fullPowerAiGrantReason);
    if (alreadyGranted) {
      return agent;
    }
    const amount = roundUsd(target - agent.walletBalance);
    if (!(amount > 0)) {
      return agent;
    }
    return this.wallet.credit(agent, amount, dondieConfig.fullPowerAiGrantReason, {
      fullPower: true,
      targetWalletUsd: target
    });
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

  async getLifestyle(userId: UUID): Promise<DondieLifestyleWorld> {
    // Opening the office on a weekend should not wait an hour for the first gig.
    await this.maybeEarnWeekendIfDue(userId);

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

  getSchedulerStatus(): SchedulerStatusView {
    return this.schedulerStatus.getStatus();
  }

  listTradeActivities(userId: UUID, limit = 100): readonly TradeActivity[] {
    return this.activities.listForUser(userId, limit);
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
    const triggerType: ScanTriggerType = "MANUAL_FORCE_SCAN";
    const scanId = randomUUID();
    const correlationId = randomUUID();
    const lockHolder = `manual:${userId}:${scanId}`;
    if (!this.schedulerStatus.tryAcquireScanLock(lockHolder)) {
      this.activities.record({
        userId,
        agentId: agent.id,
        scanId,
        correlationId,
        stage: "SIGNAL_SKIPPED",
        triggerType,
        reasonCode: "SCHEDULER_LOCKED",
        reason: "A scan is already running — manual and scheduled scans cannot overlap.",
        source: "manual"
      });
      throw new BadRequestException({
        code: "SCHEDULER_LOCKED",
        message: "A scan is already running. Wait for it to finish before forcing another."
      });
    }

    const started = Date.now();
    try {
      this.activities.record({
        userId,
        agentId: agent.id,
        scanId,
        correlationId,
        stage: "SCAN_STARTED",
        triggerType,
        source: "manual"
      });

      // No symbol from the human → agent scans its own universe.
      const result = !requestedSymbol
        ? await this.runUniverseScan(userId, agent, timeframe, {
            triggerType,
            scanId,
            correlationId
          })
        : await this.runForSymbol(userId, agent, requestedSymbol.toUpperCase(), timeframe, {
            triggerType,
            scanId,
            correlationId
          });

      this.schedulerStatus.recordScanResult({
        triggerType,
        durationMs: Date.now() - started,
        result: result.automation.status,
        symbolsEvaluated: requestedSymbol ? 1 : this.resolveSymbolUniverse(userId, agent).length,
        signalsGenerated: 1,
        ordersSubmitted: result.automation.status === "EXECUTED" ? 1 : 0,
        ordersFilled:
          result.automation.execution?.order.status === "FILLED" ||
          result.automation.execution?.order.status === "PARTIALLY_FILLED"
            ? 1
            : 0,
        nextExpectedScanAt: new Date(
          Date.now() + Math.max(60_000, dondieConfig.defaultScheduleMinutes * 60_000)
        ).toISOString()
      });
      return result;
    } finally {
      this.schedulerStatus.releaseScanLock(lockHolder);
    }
  }

  async runScheduled(userId: UUID): Promise<void> {
    let agent = this.getAgent(userId);
    if (!agent || agent.status !== "ACTIVE") {
      return;
    }
    let settings = this.platform.getAutomationSettings(userId);
    if (settings.emergencyStop || settings.runtimeState === "PAUSED" || settings.mode === "MANUAL") {
      return;
    }
    const triggerType: ScanTriggerType = "SCHEDULED";
    const scanId = randomUUID();
    const correlationId = randomUUID();
    try {
      if (isDondieFullPower()) {
        agent = await this.syncFullPowerAutonomy(userId, agent);
        settings = this.platform.getAutomationSettings(userId);
      }
      if (this.weekendEarn.isWeekendEarnWindow()) {
        await this.runWeekendSideHustle(userId, agent);
        return;
      }
      if (settings.mode !== "AUTOPILOT") {
        return;
      }
      this.activities.record({
        userId,
        agentId: agent.id,
        scanId,
        correlationId,
        stage: "SCAN_STARTED",
        triggerType,
        source: "scheduled"
      });
      await this.runUniverseScan(userId, agent, "1h", { triggerType, scanId, correlationId });
    } catch (error) {
      // Advance lastRunAt + audit so silent schedule failures are visible and not tight-looped.
      const now = isoNow();
      const updated: DondieAgent = { ...agent, lastRunAt: now, updatedAt: now };
      this.store.dondieAgents.set(agent.id, updated);
      await this.repository.persistAgent(updated);
      const reason = errorMessage(error);
      const reasonCode = classifySkipReason(reason);
      this.activities.record({
        userId,
        agentId: agent.id,
        scanId,
        correlationId,
        stage: "ERROR",
        triggerType,
        reasonCode,
        reason,
        source: "scheduled"
      });
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "DONDIE_RUN",
        entityType: "DONDIE_AGENT",
        entityId: agent.id,
        metadata: {
          scheduled: true,
          triggerType,
          scanId,
          automationStatus: "SKIPPED",
          reasonCode,
          error: reason
        }
      });
      const memory = {
        id: randomUUID(),
        agentId: agent.id,
        summary: `scheduler skipped on UNIVERSE: ${reasonCode} — ${reason}`,
        evaluation: {
          scheduled: true,
          triggerType,
          scanId,
          automationStatus: "SKIPPED",
          reasonCode,
          error: reason,
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

  /**
   * Agents due for a scheduled wake.
   * Weekends: ACTIVE non-MANUAL agents due for paper BTC (ASSISTED included so overnight
   * keepalive works even if the operator never flipped AUTOPILOT).
   * Weekdays: ACTIVE AUTOPILOT agents whose schedule interval elapsed.
   * Full power also wakes ASSISTED agents (then promotes them to AUTOPILOT on run).
   */
  listDueScheduledUserIds(nowMs: number = Date.now()): readonly UUID[] {
    const weekend = this.weekendEarn.isWeekendEarnWindow(new Date(nowMs));
    return [...this.store.dondieAgents.values()]
      .filter((agent) => {
        if (agent.status !== "ACTIVE") {
          return false;
        }
        const settings = this.platform.getAutomationSettings(agent.userId);
        if (settings.emergencyStop || settings.runtimeState === "PAUSED" || settings.mode === "MANUAL") {
          return false;
        }
        if (weekend) {
          return this.isWeekendHustleDue(agent.userId, agent, nowMs);
        }
        if (settings.mode !== "AUTOPILOT" && !isDondieFullPower()) {
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

  /**
   * Full AI power wake: Dondie re-picks its agent-managed strategy from equity + score,
   * forces AUTOPILOT, tightens the schedule, and unlocks LLM cognition when configured.
   */
  private async syncFullPowerAutonomy(userId: UUID, agent: DondieAgent): Promise<DondieAgent> {
    let updated = await this.adaptAgentManagedStrategy(userId, agent);
    updated = await this.applyFullPowerSchedule(userId, updated);
    updated = await this.ensureFullPowerAiGrant(updated);

    const portfolio = this.platform.getPrimaryPortfolio(userId);
    const template = selectAgentStrategyTemplate(
      portfolio.portfolioValue || portfolio.cashBalance,
      updated.lastEvaluationScore
    );
    const templateConfidence =
      typeof template.configuration.confidenceThreshold === "number"
        ? template.configuration.confidenceThreshold
        : 65;
    const minimumConfidence = Math.min(templateConfidence, dondieConfig.fullPowerMinConfidence);
    const symbols =
      updated.symbolUniverse.length > 0 ? [...updated.symbolUniverse] : [...DEFAULT_AUTONOMOUS_UNIVERSE];

    this.platform.updateAutomationSettings(userId, {
      mode: "AUTOPILOT",
      emergencyStop: false,
      watchlist: symbols,
      marketHoursOnly: true,
      minimumConfidence,
      maxTradesPerDay: dondieConfig.fullPowerMaxTradesPerDay,
      cooldownSeconds: 30,
      requireConfirmationAboveValue: 1_000_000_000
    });
    return updated;
  }

  /** Dondie chooses (or re-chooses) the agent-managed strategy template. */
  private async adaptAgentManagedStrategy(userId: UUID, agent: DondieAgent): Promise<DondieAgent> {
    const portfolio = this.platform.getPrimaryPortfolio(userId);
    const template = selectAgentStrategyTemplate(
      portfolio.portfolioValue || portfolio.cashBalance,
      agent.lastEvaluationScore
    );
    const templateConfidence =
      typeof template.configuration.confidenceThreshold === "number"
        ? template.configuration.confidenceThreshold
        : 65;
    const fullPower = isDondieFullPower();
    const confidenceThreshold = fullPower
      ? Math.min(templateConfidence, dondieConfig.fullPowerMinConfidence)
      : templateConfidence;
    const configuration = {
      ...template.configuration,
      templateId: template.id,
      confidenceThreshold,
      fullPower
    };

    const strategies = this.platform.listStrategies(userId);
    const managed = strategies.find((strategy) => isAgentManagedStrategy(strategy.configuration));
    const strategy = managed
      ? this.platform.updateStrategy(userId, managed.id, {
          name: template.name,
          description: template.description,
          status: "ACTIVE",
          configuration
        })
      : this.platform.createStrategy(userId, {
          name: template.name,
          description: template.description,
          status: "ACTIVE",
          configuration
        });

    return this.ensureActiveWithStrategy(userId, strategy.id);
  }

  private async maybeEarnWeekendIfDue(userId: UUID): Promise<void> {
    if (!this.weekendEarn.isWeekendEarnWindow()) {
      return;
    }
    const agent = this.getAgent(userId);
    if (!agent || agent.status !== "ACTIVE") {
      return;
    }
    const settings = this.platform.getAutomationSettings(userId);
    // MANUAL/paused operators opted out; ASSISTED still gets weekend paper BTC when the office opens.
    if (settings.mode === "MANUAL" || settings.emergencyStop || settings.runtimeState === "PAUSED") {
      return;
    }
    if (!this.isWeekendHustleDue(userId, agent)) {
      return;
    }
    if (this.weekendHustleInFlight.has(userId)) {
      return;
    }
    this.weekendHustleInFlight.add(userId);
    try {
      await this.runWeekendSideHustle(userId, agent);
    } catch {
      // Lifestyle should still render if a hustle attempt fails.
    } finally {
      this.weekendHustleInFlight.delete(userId);
    }
  }

  /** Weekend due clock uses last BTC paper scalp — not equity lastRunAt. */
  private isWeekendHustleDue(userId: UUID, agent: DondieAgent, nowMs: number = Date.now()): boolean {
    const scheduleMinutes = Math.max(1, agent.scheduleMinutes || dondieConfig.defaultScheduleMinutes);
    const scheduleMs = Math.max(60_000, scheduleMinutes * 60_000);
    const lastBtc = [...this.store.trades.values()]
      .filter(
        (trade) =>
          trade.userId === userId &&
          trade.symbol === dondieConfig.weekendEarnSymbol &&
          Boolean(trade.closedAt)
      )
      .sort((left, right) => (right.closedAt ?? "").localeCompare(left.closedAt ?? ""))[0];
    if (!lastBtc?.closedAt) {
      return true;
    }
    const last = Date.parse(lastBtc.closedAt);
    if (!Number.isFinite(last)) {
      return true;
    }
    return nowMs - last >= scheduleMs;
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
    timeframe: MarketTimeframe,
    context: {
      readonly triggerType: ScanTriggerType;
      readonly scanId: UUID;
      readonly correlationId: UUID;
    } = {
      triggerType: "SCHEDULED",
      scanId: randomUUID(),
      correlationId: randomUUID()
    }
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
        this.activities.record({
          userId,
          agentId: agent.id,
          scanId: context.scanId,
          correlationId: context.correlationId,
          stage: "SIGNAL_SKIPPED",
          triggerType: context.triggerType,
          symbol,
          reasonCode: "MAX_TRADES_PER_DAY",
          reason: `Max trades per day reached (${settings.maxTradesPerDay}).`,
          source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
        });
        break;
      }
      try {
        const result = await this.runForSymbol(userId, workingAgent, symbol, timeframe, context);
        lastResult = result;
        workingAgent = this.requireAgent(userId);
        if (result.automation.status === "EXECUTED") {
          tradesRemaining -= 1;
        }
      } catch (error) {
        failures.push(`${symbol}: ${errorMessage(error)}`);
        this.activities.record({
          userId,
          agentId: agent.id,
          scanId: context.scanId,
          correlationId: context.correlationId,
          stage: "ERROR",
          triggerType: context.triggerType,
          symbol,
          reasonCode: classifySkipReason(errorMessage(error)),
          reason: errorMessage(error),
          source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
        });
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
    timeframe: MarketTimeframe,
    context: {
      readonly triggerType: ScanTriggerType;
      readonly scanId: UUID;
      readonly correlationId: UUID;
    } = {
      triggerType: "SCHEDULED",
      scanId: randomUUID(),
      correlationId: randomUUID()
    }
  ): Promise<DondieRunResult> {
    if (!agent.strategyId) {
      throw new BadRequestException({ code: "DONDIE_STRATEGY_REQUIRED", message: "Link a strategy to Dondie." });
    }

    const portfolioBefore = this.platform.getPrimaryPortfolio(userId);
    this.activities.record({
      userId,
      agentId: agent.id,
      scanId: context.scanId,
      correlationId: context.correlationId,
      stage: "SYMBOL_EVALUATED",
      triggerType: context.triggerType,
      symbol,
      cashBefore: portfolioBefore.cashBalance,
      buyingPowerBefore: portfolioBefore.cashBalance,
      source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
    });

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

    this.activities.record({
      userId,
      agentId: agent.id,
      scanId: context.scanId,
      correlationId: context.correlationId,
      stage: "SIGNAL_GENERATED",
      triggerType: context.triggerType,
      symbol,
      signal: brainRun.signal.signalType,
      confidence: brainRun.signal.confidenceScore,
      decision: plan.action,
      source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
    });

    const orderIntentKey = `${userId}:${symbol}:${brainRun.signal.id}:${context.scanId}`;
    // Reuse the brain's signal — never regenerate, or BUY/SELL history can diverge from the trade path.
    const automation =
      plan.action === "EXECUTE"
        ? this.schedulerStatus.claimOrderIntent(orderIntentKey)
          ? await this.platform.runAutomation(userId, {
              strategyId: agent.strategyId,
              symbol,
              timeframe,
              signalId: brainRun.signal.id,
              idempotencyKey: orderIntentKey
            })
          : {
              status: "SKIPPED" as const,
              mode: "AUTO" as const,
              strategyId: agent.strategyId,
              symbol,
              signal: brainRun.signal,
              reason: "Duplicate order intent blocked by idempotency lock.",
              reasonCode: "ORDER_ALREADY_PENDING" as const
            }
        : {
            status: "SKIPPED" as const,
            mode: "AUTO" as const,
            strategyId: agent.strategyId,
            symbol,
            signal: brainRun.signal,
            reason: plan.reasoning,
            reasonCode: classifySkipReason(plan.reasoning)
          };

    if (automation.status === "SKIPPED") {
      const reasonCode =
        automation.reasonCode ?? classifySkipReason(automation.reason ?? plan.reasoning);
      this.activities.record({
        userId,
        agentId: agent.id,
        scanId: context.scanId,
        correlationId: context.correlationId,
        stage: "SIGNAL_SKIPPED",
        triggerType: context.triggerType,
        symbol,
        signal: brainRun.signal.signalType,
        confidence: brainRun.signal.confidenceScore,
        decision: "SKIP",
        reasonCode,
        reason: automation.reason ?? plan.reasoning,
        cashBefore: portfolioBefore.cashBalance,
        cashAfter: this.platform.getPrimaryPortfolio(userId).cashBalance,
        source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
      });
    } else if (automation.execution) {
      this.activities.record({
        userId,
        agentId: agent.id,
        scanId: context.scanId,
        correlationId: context.correlationId,
        stage: "ORDER_SUBMITTED",
        triggerType: context.triggerType,
        symbol,
        signal: brainRun.signal.signalType,
        confidence: brainRun.signal.confidenceScore,
        decision: "EXECUTE",
        clientOrderId: automation.execution.order.id,
        orderStatus: automation.execution.order.status,
        requestedQuantity: automation.execution.order.quantity,
        ...(typeof automation.execution.order.price === "number"
          ? {
              requestedNotional:
                automation.execution.order.quantity * automation.execution.order.price
            }
          : {}),
        source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
      });
      if (
        automation.execution.order.status === "FILLED" ||
        automation.execution.order.status === "PARTIALLY_FILLED"
      ) {
        const fillKey = `${automation.execution.order.id}:${automation.execution.order.status}:${automation.execution.order.quantity}`;
        if (this.schedulerStatus.claimFillEvent(fillKey)) {
          this.activities.record({
            userId,
            agentId: agent.id,
            scanId: context.scanId,
            correlationId: context.correlationId,
            stage: "ORDER_FILLED",
            triggerType: context.triggerType,
            symbol,
            clientOrderId: automation.execution.order.id,
            orderStatus: automation.execution.order.status,
            filledQuantity: automation.execution.order.quantity,
            filledAveragePrice: automation.execution.order.price,
            cashBefore: portfolioBefore.cashBalance,
            cashAfter: automation.execution.portfolio?.cashBalance ?? this.platform.getPrimaryPortfolio(userId).cashBalance,
            source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
          });
          if (automation.execution.position) {
            this.activities.record({
              userId,
              agentId: agent.id,
              scanId: context.scanId,
              correlationId: context.correlationId,
              stage: "POSITION_OPENED",
              triggerType: context.triggerType,
              symbol,
              filledQuantity: automation.execution.position.quantity,
              filledAveragePrice: automation.execution.position.averagePrice,
              source: context.triggerType === "MANUAL_FORCE_SCAN" ? "manual" : "scheduled"
            });
          }
        }
      }
    }

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
        automationStatus: automation.status,
        triggerType: context.triggerType,
        scanId: context.scanId,
        reasonCode: automation.reasonCode ?? null
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
      ranAt: updatedAgent.lastRunAt!,
      scanId: context.scanId,
      correlationId: context.correlationId,
      triggerType: context.triggerType,
      ...(automation.reasonCode
        ? { reasonCode: automation.reasonCode }
        : automation.status === "SKIPPED"
          ? { reasonCode: classifySkipReason(automation.reason ?? plan.reasoning) }
          : {})
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
