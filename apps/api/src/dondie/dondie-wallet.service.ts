import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DondieAgent, DondieTier, DondieWalletLedgerEntry, JsonObject, UUID } from "@trading/types";
import { PlatformStore } from "../store/platform.store.js";
import { dondieConfig } from "./dondie.config.js";
import { DondieRepository } from "./dondie.repository.js";

const isoNow = (): string => new Date().toISOString();
const roundUsd = (value: number): number => Number(value.toFixed(4));

const tierRank: Record<DondieTier, number> = {
  FREE: 0,
  STANDARD: 1,
  PRO: 2
};

const resolveTier = (balance: number): DondieTier => {
  if (balance >= dondieConfig.proTierMinBalance) {
    return "PRO";
  }
  if (balance >= dondieConfig.standardTierMinBalance) {
    return "STANDARD";
  }
  return "FREE";
};

@Injectable()
export class DondieWalletService {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(DondieRepository) private readonly repository: DondieRepository
  ) {}

  listLedger(agentId: UUID): readonly DondieWalletLedgerEntry[] {
    return [...this.store.dondieWalletLedger.values()]
      .filter((entry) => entry.agentId === agentId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async credit(
    agent: DondieAgent,
    amount: number,
    reason: string,
    metadata: JsonObject = {},
    at?: Date
  ): Promise<DondieAgent> {
    if (amount <= 0) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Credit amount must be positive." });
    }
    return this.applyEntry(agent, "CREDIT", amount, reason, metadata, at);
  }

  async debit(
    agent: DondieAgent,
    amount: number,
    reason: string,
    metadata: JsonObject = {},
    at?: Date
  ): Promise<DondieAgent> {
    if (amount <= 0) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Debit amount must be positive." });
    }
    if (agent.walletBalance < amount) {
      throw new BadRequestException({ code: "DONDIE_INSUFFICIENT_FUNDS", message: "Dondie wallet balance is too low." });
    }
    return this.applyEntry(agent, "DEBIT", amount, reason, metadata, at);
  }

  async creditTradePnl(agent: DondieAgent, pnl: number, symbol: string): Promise<DondieAgent> {
    if (pnl <= 0) {
      return agent;
    }
    const amount = roundUsd((pnl * dondieConfig.tradePnlCreditPercent) / 100);
    if (amount <= 0) {
      return agent;
    }
    return this.credit(agent, amount, "TRADE_PNL_SHARE", { symbol, pnl, percent: dondieConfig.tradePnlCreditPercent });
  }

  private async applyEntry(
    agent: DondieAgent,
    entryType: DondieWalletLedgerEntry["entryType"],
    amount: number,
    reason: string,
    metadata: JsonObject,
    at?: Date
  ): Promise<DondieAgent> {
    const stampedAt = at?.toISOString() ?? isoNow();
    const signedAmount = entryType === "CREDIT" ? amount : -amount;
    const balanceAfter = roundUsd(agent.walletBalance + signedAmount);
    const entry: DondieWalletLedgerEntry = {
      id: randomUUID(),
      agentId: agent.id,
      entryType,
      reason,
      amount: roundUsd(amount),
      balanceAfter,
      metadata,
      createdAt: stampedAt
    };
    this.store.dondieWalletLedger.set(entry.id, entry);
    await this.repository.persistLedgerEntry(entry);

    const nextTier = resolveTier(balanceAfter);
    const updated: DondieAgent = {
      ...agent,
      walletBalance: balanceAfter,
      tier: nextTier,
      updatedAt: stampedAt
    };
    this.store.dondieAgents.set(agent.id, updated);
    await this.repository.persistAgent(updated);

    if (nextTier !== agent.tier) {
      this.store.appendAudit({
        userId: agent.userId,
        actorUserId: agent.userId,
        action:
          tierRank[nextTier] > tierRank[agent.tier] ? "DONDIE_TIER_UPGRADED" : "DONDIE_TIER_DOWNGRADED",
        entityType: "DONDIE_AGENT",
        entityId: agent.id,
        metadata: { fromTier: agent.tier, toTier: nextTier, balanceAfter }
      });
    }

    return updated;
  }
}
