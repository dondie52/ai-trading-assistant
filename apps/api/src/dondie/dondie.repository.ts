import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  DondieAgent,
  DondieMemory,
  DondieSubscription,
  DondieWalletLedgerEntry,
  JsonObject,
  UUID
} from "@trading/types";
import { PrismaService } from "../infrastructure/prisma.service.js";
import type { PlatformStore } from "../store/platform.store.js";

const toDate = (value: string): Date => new Date(value);
const toJson = (value: JsonObject): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const mapAgent = (row: {
  id: string;
  userId: string;
  name: string;
  tier: string;
  status: string;
  walletBalance: Prisma.Decimal;
  strategyId: string | null;
  scheduleMinutes: number;
  symbolUniverse: string[];
  lastRunAt: Date | null;
  lastEvaluationScore: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}): DondieAgent => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  tier: row.tier as DondieAgent["tier"],
  status: row.status as DondieAgent["status"],
  walletBalance: Number(row.walletBalance),
  ...(row.strategyId ? { strategyId: row.strategyId } : {}),
  scheduleMinutes: row.scheduleMinutes,
  symbolUniverse: row.symbolUniverse,
  ...(row.lastRunAt ? { lastRunAt: row.lastRunAt.toISOString() } : {}),
  ...(row.lastEvaluationScore ? { lastEvaluationScore: Number(row.lastEvaluationScore) } : {}),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

@Injectable()
export class DondieRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return Boolean(process.env.DATABASE_URL);
  }

  async hydrate(store: PlatformStore): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    const [agents, ledger, memories, subscriptions] = await Promise.all([
      this.prisma.client().dondieAgent.findMany(),
      this.prisma.client().dondieWalletLedgerEntry.findMany(),
      this.prisma.client().dondieMemory.findMany(),
      this.prisma.client().dondieSubscription.findMany()
    ]);
    for (const agent of agents) {
      store.dondieAgents.set(agent.id, mapAgent(agent));
    }
    for (const entry of ledger) {
      store.dondieWalletLedger.set(entry.id, {
        id: entry.id,
        agentId: entry.agentId,
        entryType: entry.entryType as DondieWalletLedgerEntry["entryType"],
        reason: entry.reason,
        amount: Number(entry.amount),
        balanceAfter: Number(entry.balanceAfter),
        metadata: entry.metadata as JsonObject,
        createdAt: entry.createdAt.toISOString()
      });
    }
    for (const memory of memories) {
      store.dondieMemories.set(memory.id, {
        id: memory.id,
        agentId: memory.agentId,
        ...(memory.runId ? { runId: memory.runId } : {}),
        summary: memory.summary,
        evaluation: memory.evaluation as JsonObject,
        createdAt: memory.createdAt.toISOString()
      });
    }
    for (const subscription of subscriptions) {
      store.dondieSubscriptions.set(subscription.id, {
        id: subscription.id,
        userId: subscription.userId,
        agentId: subscription.agentId,
        plan: subscription.plan as DondieSubscription["plan"],
        status: subscription.status as DondieSubscription["status"],
        monthlyPriceUsd: Number(subscription.monthlyPriceUsd),
        ...(subscription.externalId ? { externalId: subscription.externalId } : {}),
        revenueCredited: Number(subscription.revenueCredited),
        createdAt: subscription.createdAt.toISOString(),
        updatedAt: subscription.updatedAt.toISOString()
      });
    }
  }

  async persistAgent(agent: DondieAgent): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().dondieAgent.upsert({
      where: { id: agent.id },
      create: {
        id: agent.id,
        userId: agent.userId,
        name: agent.name,
        tier: agent.tier,
        status: agent.status,
        walletBalance: agent.walletBalance,
        strategyId: agent.strategyId ?? null,
        scheduleMinutes: agent.scheduleMinutes,
        symbolUniverse: [...agent.symbolUniverse],
        lastRunAt: agent.lastRunAt ? toDate(agent.lastRunAt) : null,
        lastEvaluationScore: agent.lastEvaluationScore ?? null,
        createdAt: toDate(agent.createdAt),
        updatedAt: toDate(agent.updatedAt)
      },
      update: {
        name: agent.name,
        tier: agent.tier,
        status: agent.status,
        walletBalance: agent.walletBalance,
        strategyId: agent.strategyId ?? null,
        scheduleMinutes: agent.scheduleMinutes,
        symbolUniverse: [...agent.symbolUniverse],
        lastRunAt: agent.lastRunAt ? toDate(agent.lastRunAt) : null,
        lastEvaluationScore: agent.lastEvaluationScore ?? null,
        updatedAt: toDate(agent.updatedAt)
      }
    });
  }

  async persistMemory(memory: DondieMemory): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().dondieMemory.create({
      data: {
        id: memory.id,
        agentId: memory.agentId,
        runId: memory.runId ?? null,
        summary: memory.summary,
        evaluation: toJson(memory.evaluation),
        createdAt: toDate(memory.createdAt)
      }
    });
  }

  async persistSubscription(subscription: DondieSubscription): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().dondieSubscription.upsert({
      where: { id: subscription.id },
      create: {
        id: subscription.id,
        userId: subscription.userId,
        agentId: subscription.agentId,
        plan: subscription.plan,
        status: subscription.status,
        monthlyPriceUsd: subscription.monthlyPriceUsd,
        externalId: subscription.externalId ?? null,
        revenueCredited: subscription.revenueCredited,
        createdAt: toDate(subscription.createdAt),
        updatedAt: toDate(subscription.updatedAt)
      },
      update: {
        plan: subscription.plan,
        status: subscription.status,
        monthlyPriceUsd: subscription.monthlyPriceUsd,
        externalId: subscription.externalId ?? null,
        revenueCredited: subscription.revenueCredited,
        updatedAt: toDate(subscription.updatedAt)
      }
    });
  }

  async persistLedgerEntry(entry: DondieWalletLedgerEntry): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.prisma.client().dondieWalletLedgerEntry.create({
      data: {
        id: entry.id,
        agentId: entry.agentId,
        entryType: entry.entryType,
        reason: entry.reason,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        metadata: toJson(entry.metadata),
        createdAt: toDate(entry.createdAt)
      }
    });
  }
}
