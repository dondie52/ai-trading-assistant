import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { DondieRepository } from "../src/dondie/dondie.repository.js";
import { PlatformStore } from "../src/store/platform.store.js";
import type { DondieAgent, DondieMemory, DondieWalletLedgerEntry } from "@trading/types";

const createPrismaStub = (overrides: Record<string, unknown> = {}) => {
  const client = {
    dondieAgent: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      ...((overrides.dondieAgent as object) ?? {})
    },
    dondieWalletLedgerEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      ...((overrides.dondieWalletLedgerEntry as object) ?? {})
    },
    dondieMemory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      ...((overrides.dondieMemory as object) ?? {})
    }
  };
  return {
    client: () => client,
    _client: client
  };
};

describe("DondieRepository", () => {
  it("no-ops when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const prisma = createPrismaStub();
    const repository = new DondieRepository(prisma as never);
    const store = new PlatformStore();
    await repository.hydrate(store);
    expect(prisma._client.dondieAgent.findMany).not.toHaveBeenCalled();
  });

  it("hydrates agents, ledger, and memories from prisma", async () => {
    process.env.DATABASE_URL = "postgresql://example";
    const now = new Date();
    const agentId = randomUUID();
    const prisma = createPrismaStub({
      dondieAgent: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: agentId,
            userId: randomUUID(),
            name: "Dondie",
            tier: "STANDARD",
            status: "ACTIVE",
            walletBalance: 30,
            strategyId: null,
            scheduleMinutes: 60,
            symbolUniverse: ["AAPL"],
            lastRunAt: now,
            lastEvaluationScore: 70,
            createdAt: now,
            updatedAt: now
          }
        ]),
        upsert: vi.fn().mockResolvedValue({})
      },
      dondieWalletLedgerEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: randomUUID(),
            agentId,
            entryType: "CREDIT",
            reason: "TEST",
            amount: 30,
            balanceAfter: 30,
            metadata: { source: "test" },
            createdAt: now
          }
        ]),
        create: vi.fn().mockResolvedValue({})
      },
      dondieMemory: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: randomUUID(),
            agentId,
            runId: randomUUID(),
            summary: "ran",
            evaluation: { score: 70 },
            createdAt: now
          }
        ]),
        create: vi.fn().mockResolvedValue({})
      }
    });
    const repository = new DondieRepository(prisma as never);
    const store = new PlatformStore();
    await repository.hydrate(store);
    expect(store.dondieAgents.size).toBe(1);
    expect(store.dondieWalletLedger.size).toBe(1);
    expect(store.dondieMemories.size).toBe(1);

    const agent = [...store.dondieAgents.values()][0] as DondieAgent;
    await repository.persistAgent(agent);
    expect(prisma._client.dondieAgent.upsert).toHaveBeenCalled();

    const entry = [...store.dondieWalletLedger.values()][0] as DondieWalletLedgerEntry;
    await repository.persistLedgerEntry(entry);
    expect(prisma._client.dondieWalletLedgerEntry.create).toHaveBeenCalled();

    const memory = [...store.dondieMemories.values()][0] as DondieMemory;
    await repository.persistMemory(memory);
    expect(prisma._client.dondieMemory.create).toHaveBeenCalled();

    delete process.env.DATABASE_URL;
  });
});
