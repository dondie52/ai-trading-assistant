import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isUsEquityWeekend } from "@trading/shared";
import type {
  AutomationRunResult,
  DondieAgent,
  DondieRunResult,
  DondieTier,
  Signal,
  UUID
} from "@trading/types";
import { dondieConfig } from "./dondie.config.js";
import { DondieWalletService } from "./dondie-wallet.service.js";

const isoNow = (): string => new Date().toISOString();
const roundUsd = (value: number): number => Number(value.toFixed(4));

const GIGS = [
  {
    id: "CRYPTO_DESK_SCAN",
    label: "crypto desk scan",
    summary: "Scanned weekend crypto tape and logged relative-strength notes for Monday."
  },
  {
    id: "STABLECOIN_CARRY_NOTES",
    label: "stablecoin carry notes",
    summary: "Compiled funding/carry notes from the crypto desk while equities sleep."
  },
  {
    id: "WEEKEND_RESEARCH_BRIEF",
    label: "weekend research brief",
    summary: "Wrote a weekend research brief tying crypto flows to the equity watchlist."
  }
] as const;

const tierBonus = (tier: DondieTier): number => {
  if (tier === "PRO") {
    return dondieConfig.weekendEarnProBonusUsd;
  }
  if (tier === "STANDARD") {
    return dondieConfig.weekendEarnStandardBonusUsd;
  }
  return 0;
};

/** Deterministic 0..1 salt from agent + UTC day so tests stay stable. */
const daySalt = (agentId: UUID, dayKey: string): number => {
  let hash = 0;
  const seed = `${agentId}:${dayKey}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
};

@Injectable()
export class DondieWeekendEarnService {
  constructor(@Inject(DondieWalletService) private readonly wallet: DondieWalletService) {}

  isWeekendEarnWindow(at: Date = new Date()): boolean {
    // Prefer live env so tests can toggle without module reload.
    const enabled = process.env.DONDIE_WEEKEND_EARN_ENABLED !== "false";
    return enabled && isUsEquityWeekend(at);
  }

  creditedToday(agentId: UUID, dayKey: string = new Date().toISOString().slice(0, 10)): number {
    return this.wallet
      .listLedger(agentId)
      .filter(
        (entry) =>
          entry.entryType === "CREDIT" &&
          entry.reason === dondieConfig.weekendEarnLedgerReason &&
          entry.createdAt.startsWith(dayKey)
      )
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  resolveGigPayout(agent: DondieAgent, at: Date = new Date()): {
    readonly gig: (typeof GIGS)[number];
    readonly amount: number;
    readonly remainingDailyCap: number;
  } {
    const dayKey = at.toISOString().slice(0, 10);
    const earnedToday = this.creditedToday(agent.id, dayKey);
    const remainingDailyCap = Math.max(0, roundUsd(dondieConfig.weekendEarnMaxPerDayUsd - earnedToday));
    const salt = daySalt(agent.id, dayKey);
    const gig = GIGS[Math.floor(salt * GIGS.length) % GIGS.length]!;
    const raw = dondieConfig.weekendEarnBaseUsd + tierBonus(agent.tier) + salt * 0.2;
    const amount = roundUsd(Math.min(remainingDailyCap, Math.max(0, raw)));
    return { gig, amount, remainingDailyCap };
  }

  async runWeekendGig(userId: UUID, agent: DondieAgent, at: Date = new Date()): Promise<DondieRunResult> {
    const { gig, amount, remainingDailyCap } = this.resolveGigPayout(agent, at);
    const now = isoNow();
    const symbol = dondieConfig.weekendEarnSymbol;
    const strategyId = agent.strategyId ?? agent.id;

    let updatedAgent = agent;
    if (amount > 0) {
      updatedAgent = await this.wallet.credit(agent, amount, dondieConfig.weekendEarnLedgerReason, {
        gig: gig.id,
        symbol,
        weekend: true,
        remainingDailyCap: roundUsd(remainingDailyCap - amount)
      });
    }

    updatedAgent = {
      ...updatedAgent,
      lastRunAt: now,
      updatedAt: now
    };

    const signal: Signal = {
      id: randomUUID(),
      userId,
      strategyId,
      symbol,
      signalType: "HOLD",
      confidenceScore: 55,
      modelVersion: dondieConfig.weekendEarnBrain,
      features: { weekendGig: gig.id, earnedUsd: amount },
      generatedAt: now
    };

    const reasoning =
      amount > 0
        ? `Weekend ${gig.label}: earned $${amount.toFixed(2)} for the survival wallet (${gig.summary})`
        : `Weekend ${gig.label}: daily crypto-desk cap reached ($${dondieConfig.weekendEarnMaxPerDayUsd.toFixed(2)}).`;

    const automation: AutomationRunResult = {
      status: "SKIPPED",
      mode: "AUTO",
      strategyId,
      symbol,
      signal,
      reason: reasoning
    };

    return {
      agentId: agent.id,
      tier: updatedAgent.tier,
      symbol,
      brain: dondieConfig.weekendEarnBrain,
      reasoning,
      automation,
      walletBalance: updatedAgent.walletBalance,
      ranAt: now
    };
  }
}
