import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/infrastructure/prisma.service.js";
import { PlatformStore } from "../src/store/platform.store.js";
import { DondieRepository } from "../src/dondie/dondie.repository.js";
import { DondieWalletService } from "../src/dondie/dondie-wallet.service.js";
import type { DondieAgent } from "@trading/types";

const createWallet = (): { readonly wallet: DondieWalletService; readonly store: PlatformStore } => {
  const store = new PlatformStore();
  const wallet = new DondieWalletService(store, new DondieRepository(new PrismaService()));
  return { wallet, store };
};

const createAgent = (store: PlatformStore): DondieAgent => {
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
  return agent;
};

describe("Dondie phase 2 wallet", () => {
  it("credits balance and upgrades tier thresholds", async () => {
    process.env.DONDIE_STANDARD_MIN_BALANCE = "25";
    process.env.DONDIE_PRO_MIN_BALANCE = "100";
    const { wallet, store } = createWallet();
    let agent = createAgent(store);

    agent = await wallet.credit(agent, 30, "TEST_GRANT");
    expect(agent.walletBalance).toBe(30);
    expect(agent.tier).toBe("STANDARD");

    agent = await wallet.credit(agent, 75, "TEST_GRANT");
    expect(agent.walletBalance).toBe(105);
    expect(agent.tier).toBe("PRO");
  });

  it("debits balance and downgrades when below thresholds", async () => {
    process.env.DONDIE_STANDARD_MIN_BALANCE = "25";
    process.env.DONDIE_PRO_MIN_BALANCE = "100";
    const { wallet, store } = createWallet();
    let agent = createAgent(store);
    agent = await wallet.credit(agent, 110, "TEST_GRANT");
    expect(agent.tier).toBe("PRO");

    agent = await wallet.debit(agent, 90, "TEST_CHARGE");
    expect(agent.walletBalance).toBe(20);
    expect(agent.tier).toBe("FREE");
  });
});
