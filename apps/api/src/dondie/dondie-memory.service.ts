import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DondieAgent, DondieMemory, DondieRunResult, JsonObject, UUID } from "@trading/types";
import { classifySkipReason } from "@trading/shared";
import { PlatformStore } from "../store/platform.store.js";
import { dondieConfig } from "./dondie.config.js";
import { DondieRepository } from "./dondie.repository.js";

const isoNow = (): string => new Date().toISOString();

@Injectable()
export class DondieMemoryService {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(DondieRepository) private readonly repository: DondieRepository
  ) {}

  listMemories(agentId: UUID): readonly DondieMemory[] {
    return [...this.store.dondieMemories.values()]
      .filter((memory) => memory.agentId === agentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  evaluateRun(result: DondieRunResult): { readonly score: number; readonly evaluation: JsonObject } {
    const executed = result.automation.status === "EXECUTED";
    const confidence = result.automation.signal.confidenceScore;
    const reasonCode =
      result.reasonCode ??
      result.automation.reasonCode ??
      (result.automation.status === "SKIPPED"
        ? classifySkipReason(result.automation.reason ?? result.reasoning)
        : undefined);
    const base = executed ? 55 : 35;
    const confidenceBonus = Math.min(30, Math.round(confidence / 4));
    const walletBonus = result.walletBalance >= dondieConfig.standardTierMinBalance ? 10 : 0;
    const score = Math.min(100, base + confidenceBonus + walletBonus);
    return {
      score,
      evaluation: {
        executed,
        confidence,
        brain: result.brain,
        symbol: result.symbol,
        automationStatus: result.automation.status,
        walletBalance: result.walletBalance,
        score,
        ...(reasonCode ? { reasonCode } : {}),
        ...(result.triggerType ? { triggerType: result.triggerType } : {}),
        ...(result.scanId ? { scanId: result.scanId } : {}),
        ...(result.automation.reason ? { skipReason: result.automation.reason } : {})
      }
    };
  }

  async recordRun(agent: DondieAgent, result: DondieRunResult): Promise<DondieAgent> {
    const { score, evaluation } = this.evaluateRun(result);
    const weekendGig = result.brain === dondieConfig.weekendEarnBrain;
    const reasonCode =
      typeof evaluation.reasonCode === "string" ? evaluation.reasonCode : undefined;
    const skipDetail =
      result.automation.status === "SKIPPED"
        ? result.automation.reason ?? result.reasoning
        : result.reasoning;
    const summary = weekendGig
      ? `weekend crypto desk on ${result.symbol}: ${result.reasoning}`
      : result.automation.status === "SKIPPED"
        ? `${result.brain} brain skipped on ${result.symbol}: ${reasonCode ?? "UNKNOWN"}${
            skipDetail ? ` — ${skipDetail}` : ""
          }`
        : result.automation.status === "EXECUTED"
          ? `${result.brain} brain executed on ${result.symbol}: ${result.reasoning}`
          : `${result.brain} brain ${result.automation.status.toLowerCase()} on ${result.symbol}: ${result.reasoning}`;
    const memory: DondieMemory = {
      id: randomUUID(),
      agentId: agent.id,
      summary,
      evaluation: {
        ...evaluation,
        ...(weekendGig ? { weekendGig: true } : {})
      },
      createdAt: isoNow()
    };
    this.store.dondieMemories.set(memory.id, memory);
    await this.repository.persistMemory(memory);
    this.pruneMemories(agent.id);

    // Weekend gigs must not pollute the equity trading universe.
    const symbolUniverse = weekendGig
      ? agent.symbolUniverse
      : this.nextSymbolUniverse(agent, result.symbol, score);
    const updated: DondieAgent = {
      ...agent,
      lastEvaluationScore: score,
      lastRunAt: result.ranAt ?? agent.lastRunAt,
      symbolUniverse,
      updatedAt: isoNow()
    };
    this.store.dondieAgents.set(agent.id, updated);
    await this.repository.persistAgent(updated);
    return updated;
  }

  async updateSymbolUniverse(userId: UUID, agent: DondieAgent, symbols: readonly string[]): Promise<DondieAgent> {
    const normalized = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const watchlist = [...this.store.watchlists.values()].find((entry) => entry.userId === userId);
    const merged = [...new Set([...normalized, ...(watchlist?.symbols ?? [])])].slice(0, 20);
    const updated: DondieAgent = {
      ...agent,
      symbolUniverse: merged,
      updatedAt: isoNow()
    };
    this.store.dondieAgents.set(agent.id, updated);
    await this.repository.persistAgent(updated);
    return updated;
  }

  private nextSymbolUniverse(agent: DondieAgent, symbol: string, score: number): readonly string[] {
    if (score < 50) {
      return agent.symbolUniverse;
    }
    const universe = new Set(agent.symbolUniverse);
    universe.add(symbol.toUpperCase());
    const ranked = [...this.listMemories(agent.id)]
      .map((memory) => ({
        symbol: typeof memory.evaluation.symbol === "string" ? memory.evaluation.symbol : "",
        score: typeof memory.evaluation.score === "number" ? memory.evaluation.score : 0
      }))
      .filter((entry) => entry.symbol)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.symbol);
    for (const candidate of ranked) {
      universe.add(candidate);
    }
    return [...universe].slice(0, 12);
  }

  private pruneMemories(agentId: UUID): void {
    const memories = this.listMemories(agentId);
    if (memories.length <= dondieConfig.memoryLimit) {
      return;
    }
    for (const memory of memories.slice(dondieConfig.memoryLimit)) {
      this.store.dondieMemories.delete(memory.id);
    }
  }
}
