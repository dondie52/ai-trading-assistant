import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { DondieAgent } from "@trading/types";
import { PrismaService } from "../src/infrastructure/prisma.service.js";
import { PlatformStore } from "../src/store/platform.store.js";
import { DondieBillingService } from "../src/dondie/dondie-billing.service.js";
import { DondieRepository } from "../src/dondie/dondie.repository.js";
import { DondieWalletService } from "../src/dondie/dondie-wallet.service.js";

const createBilling = (): {
  readonly billing: DondieBillingService;
  readonly store: PlatformStore;
} => {
  const store = new PlatformStore();
  const repository = new DondieRepository(new PrismaService());
  const wallet = new DondieWalletService(store, repository);
  const billing = new DondieBillingService(store, repository, wallet);
  return { billing, store };
};

const createAgent = (store: PlatformStore, userId: string): DondieAgent => {
  const now = new Date().toISOString();
  const agent: DondieAgent = {
    id: randomUUID(),
    userId,
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
  return agent;
};

describe("Dondie phase 4 billing", () => {
  it("creates a subscription and credits the agent wallet", async () => {
    const { billing, store } = createBilling();
    const userId = randomUUID();
    const agent = createAgent(store, userId);

    const subscription = await billing.subscribe(userId, agent);
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.plan).toBe("PRO");

    const updatedAgent = store.dondieAgents.get(agent.id);
    expect(updatedAgent?.walletBalance).toBeGreaterThan(0);
    expect(store.dondieWalletLedger.size).toBeGreaterThan(0);
  });
});
