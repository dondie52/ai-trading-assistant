import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { DondieAgent, DondieRunResult } from "@trading/types";
import { PrismaService } from "../src/infrastructure/prisma.service.js";
import { PlatformStore } from "../src/store/platform.store.js";
import { DondieMemoryService } from "../src/dondie/dondie-memory.service.js";
import { DondieRepository } from "../src/dondie/dondie.repository.js";

const createMemory = (): { readonly memory: DondieMemoryService; readonly store: PlatformStore } => {
  const store = new PlatformStore();
  const memory = new DondieMemoryService(store, new DondieRepository(new PrismaService()));
  return { memory, store };
};

const sampleRun = (agentId: string): DondieRunResult => ({
  agentId,
  tier: "FREE",
  symbol: "AAPL",
  brain: "free",
  reasoning: "Test run",
  automation: {
    status: "SKIPPED",
    mode: "AUTO",
    strategyId: randomUUID(),
    symbol: "AAPL",
    signal: {
      id: randomUUID(),
      userId: randomUUID(),
      strategyId: randomUUID(),
      symbol: "AAPL",
      signalType: "HOLD",
      confidenceScore: 64,
      modelVersion: "mvp-baseline-1.0.0",
      features: {},
      generatedAt: new Date().toISOString()
    },
    reason: "HOLD"
  },
  walletBalance: 0,
  ranAt: new Date().toISOString()
});

describe("Dondie phase 5 memory", () => {
  it("records memories and expands the symbol universe after good runs", async () => {
    const { memory, store } = createMemory();
    const now = new Date().toISOString();
    const agent: DondieAgent = {
      id: randomUUID(),
      userId: randomUUID(),
      name: "Dondie",
      tier: "FREE",
      status: "ACTIVE",
      walletBalance: 0,
      scheduleMinutes: 60,
      symbolUniverse: [],
      createdAt: now,
      updatedAt: now
    };
    store.dondieAgents.set(agent.id, agent);

    const updated = await memory.recordRun(agent, sampleRun(agent.id));
    expect(updated.lastEvaluationScore).toBeGreaterThan(0);
    expect(updated.symbolUniverse).toContain("AAPL");
    expect(memory.listMemories(agent.id)).toHaveLength(1);
  });
});
