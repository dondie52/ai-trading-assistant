import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DondieAgent, DondieRunResult, JsonObject, MarketTimeframe, UUID } from "@trading/types";
import { PlatformService } from "../platform.service.js";
import { PlatformStore } from "../store/platform.store.js";
import { DondieBrainFreeService } from "./dondie-brain-free.service.js";
import { dondieConfig } from "./dondie.config.js";
import { DondieRepository } from "./dondie.repository.js";
import { DondieScheduler } from "./dondie.scheduler.js";

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

@Injectable()
export class DondieService implements OnModuleInit {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(DondieRepository) private readonly repository: DondieRepository,
    @Inject(DondieBrainFreeService) private readonly freeBrain: DondieBrainFreeService,
    @Inject(DondieScheduler) private readonly scheduler: DondieScheduler
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.hydrate(this.store);
    this.scheduler.start(
      (scheduledUserId) => this.runScheduled(scheduledUserId),
      () => this.listScheduledUserIds()
    );
  }

  getAgent(userId: UUID): DondieAgent | undefined {
    return [...this.store.dondieAgents.values()].find((agent) => agent.userId === userId);
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
    const symbol = (readString(body, "symbol") || this.pickSymbol(userId, agent)).toUpperCase();
    const timeframe = (readString(body, "timeframe") || "1h") as MarketTimeframe;
    const plan = await this.freeBrain.plan(userId, agent.strategyId, symbol, timeframe);

    const automation =
      plan.action === "EXECUTE"
        ? await this.platform.runAutomation(userId, {
            strategyId: agent.strategyId,
            symbol,
            timeframe
          })
        : {
            status: "SKIPPED" as const,
            mode: "AUTO" as const,
            strategyId: agent.strategyId,
            symbol,
            signal: await this.platform.generateTradingSignal(userId, { strategyId: agent.strategyId, symbol, timeframe }),
            reason: plan.reasoning
          };

    const updatedAgent: DondieAgent = {
      ...agent,
      lastRunAt: isoNow(),
      updatedAt: isoNow()
    };
    this.store.dondieAgents.set(agent.id, updatedAgent);
    await this.repository.persistAgent(updatedAgent);

    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "DONDIE_RUN",
      entityType: "DONDIE_AGENT",
      entityId: agent.id,
      metadata: {
        tier: agent.tier,
        symbol,
        brain: "free",
        plan: plan as unknown as JsonObject,
        automationStatus: automation.status
      }
    });

    return {
      agentId: agent.id,
      tier: agent.tier,
      symbol,
      brain: "free",
      reasoning: plan.reasoning,
      automation,
      walletBalance: updatedAgent.walletBalance,
      ranAt: updatedAgent.lastRunAt!
    };
  }

  async runScheduled(userId: UUID): Promise<void> {
    const agent = this.getAgent(userId);
    if (!agent || agent.status !== "ACTIVE") {
      return;
    }
    await this.run(userId, {});
  }

  listScheduledUserIds(): readonly UUID[] {
    return [...this.store.dondieAgents.values()]
      .filter((agent) => agent.status === "ACTIVE")
      .map((agent) => agent.userId);
  }

  private pickSymbol(userId: UUID, agent: DondieAgent): string {
    if (agent.symbolUniverse.length > 0) {
      const index = Math.floor(Date.now() / 3_600_000) % agent.symbolUniverse.length;
      return agent.symbolUniverse[index] ?? "AAPL";
    }
    const watchlist = [...this.store.watchlists.values()].find((entry) => entry.userId === userId);
    if (watchlist && watchlist.symbols.length > 0) {
      return watchlist.symbols[0]!;
    }
    return "AAPL";
  }
}
