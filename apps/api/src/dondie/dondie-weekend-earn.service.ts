import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { isUsEquityWeekend } from "@trading/shared";
import type {
  AutomationRunResult,
  DondieAgent,
  DondieRunResult,
  DondieTier,
  Order,
  Portfolio,
  Signal,
  Trade,
  UUID
} from "@trading/types";
import { PlatformStore } from "../store/platform.store.js";
import { dondieConfig } from "./dondie.config.js";
import { DondieWalletService } from "./dondie-wallet.service.js";

const isoNow = (): string => new Date().toISOString();
const roundUsd = (value: number): number => Number(value.toFixed(4));
const roundPrice = (value: number): number => Number(value.toFixed(2));

/** Deterministic 0..1 salt so tests stay stable for a given agent/day/run. */
const runSalt = (agentId: UUID, dayKey: string, runIndex: number): number => {
  let hash = 0;
  const seed = `${agentId}:${dayKey}:${runIndex}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
};

const winChanceForTier = (tier: DondieTier): number => {
  if (tier === "PRO") {
    return 0.58;
  }
  if (tier === "STANDARD") {
    return 0.55;
  }
  return 0.52;
};

@Injectable()
export class DondieWeekendEarnService {
  constructor(
    @Inject(DondieWalletService) private readonly wallet: DondieWalletService,
    @Inject(PlatformStore) private readonly store: PlatformStore
  ) {}

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

  weekendRunsToday(agentId: UUID, dayKey: string): number {
    return this.wallet
      .listLedger(agentId)
      .filter(
        (entry) =>
          entry.reason === dondieConfig.weekendEarnLedgerReason && entry.createdAt.startsWith(dayKey)
      ).length;
  }

  async runWeekendGig(userId: UUID, agent: DondieAgent, at: Date = new Date()): Promise<DondieRunResult> {
    const dayKey = at.toISOString().slice(0, 10);
    const runIndex = this.countPaperCryptoTradesToday(userId, dayKey);
    const salt = runSalt(agent.id, dayKey, runIndex);
    const now = isoNow();
    const symbol = dondieConfig.weekendEarnSymbol;
    const strategyId = agent.strategyId ?? agent.id;
    const remainingDailyCap = Math.max(
      0,
      roundUsd(dondieConfig.weekendEarnMaxPerDayUsd - this.creditedToday(agent.id, dayKey))
    );

    const side = salt >= 0.48 ? "BUY" : "SELL";
    const entryPrice = roundPrice(64_000 + (salt - 0.5) * 2_400);
    const quantity = 0.01;
    const movePct = 0.0012 + salt * 0.0038;
    const won = salt < winChanceForTier(agent.tier);
    const signedMove = won ? movePct : -movePct;
    const exitPrice = roundPrice(entryPrice * (1 + (side === "BUY" ? signedMove : -signedMove)));
    const grossPnl = roundUsd(quantity * (side === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice));
    const walletCredit =
      grossPnl > 0 ? roundUsd(Math.min(remainingDailyCap, Math.max(0.05, grossPnl * 0.35 + tierFloor(agent.tier)))) : 0;

    this.store.ensureDefaultAccountState(userId);
    const portfolio = [...this.store.portfolios.values()].find((entry) => entry.userId === userId);
    if (!portfolio) {
      throw new Error("Weekend crypto desk requires a portfolio.");
    }
    const broker =
      [...this.store.brokerAccounts.values()].find(
        (account) => account.userId === userId && account.brokerName === "PAPER"
      ) ??
      [...this.store.brokerAccounts.values()].find((account) => account.userId === userId);

    const signal: Signal = {
      id: randomUUID(),
      userId,
      strategyId,
      symbol,
      signalType: side,
      confidenceScore: Math.round(58 + salt * 20),
      modelVersion: dondieConfig.weekendEarnBrain,
      features: {
        weekendGig: true,
        venue: "PAPER_CRYPTO",
        movePct,
        won
      },
      generatedAt: now
    };
    this.store.signals.set(signal.id, signal);

    const order: Order = {
      id: randomUUID(),
      userId,
      brokerAccountId: broker?.id ?? portfolio.id,
      strategyId,
      signalId: signal.id,
      symbol,
      side,
      orderType: "MARKET",
      mode: "AUTO",
      quantity,
      price: entryPrice,
      stopLoss: roundPrice(entryPrice * (side === "BUY" ? 0.995 : 1.005)),
      takeProfit: roundPrice(entryPrice * (side === "BUY" ? 1.005 : 0.995)),
      status: "FILLED",
      submittedAt: now,
      riskDecision: {
        approved: true,
        reasons: ["Weekend paper crypto desk — survival wallet path (not live venue)."],
        maxRiskAmount: roundUsd(entryPrice * quantity * 0.01),
        proposedRiskAmount: roundUsd(Math.abs(grossPnl)),
        proposedPositionValue: roundUsd(entryPrice * quantity),
        calculatedQuantity: quantity
      }
    };
    this.store.orders.set(order.id, order);

    const trade: Trade = {
      id: randomUUID(),
      orderId: order.id,
      userId,
      symbol,
      side,
      quantity,
      entryPrice,
      exitPrice,
      pnl: grossPnl,
      openedAt: now,
      closedAt: now
    };
    this.store.trades.set(trade.id, trade);

    const nextPortfolio: Portfolio = {
      ...portfolio,
      cashBalance: roundUsd(portfolio.cashBalance + grossPnl),
      portfolioValue: roundUsd(portfolio.portfolioValue + grossPnl),
      realizedPnl: roundUsd(portfolio.realizedPnl + grossPnl)
    };
    this.store.portfolios.set(portfolio.id, nextPortfolio);

    let updatedAgent = agent;
    if (walletCredit > 0) {
      updatedAgent = await this.wallet.credit(agent, walletCredit, dondieConfig.weekendEarnLedgerReason, {
        symbol,
        side,
        grossPnl,
        entryPrice,
        exitPrice,
        weekend: true,
        venue: "PAPER_CRYPTO",
        remainingDailyCap: roundUsd(remainingDailyCap - walletCredit)
      });
    }

    updatedAgent = {
      ...updatedAgent,
      lastRunAt: now,
      updatedAt: now
    };

    const reasoning =
      walletCredit > 0
        ? `Paper BTCUSD ${side}: closed ${won ? "green" : "red"} $${grossPnl.toFixed(2)} → wallet +$${walletCredit.toFixed(2)}`
        : grossPnl <= 0
          ? `Paper BTCUSD ${side}: closed $${grossPnl.toFixed(2)} — no wallet credit this scalp`
          : `Paper BTCUSD ${side}: daily crypto-desk cap reached ($${dondieConfig.weekendEarnMaxPerDayUsd.toFixed(2)})`;

    const automation: AutomationRunResult = {
      status: "EXECUTED",
      mode: "AUTO",
      strategyId,
      symbol,
      signal,
      reason: reasoning,
      execution: {
        order,
        trade,
        portfolio: nextPortfolio,
        riskDecision: order.riskDecision
      },
      summary: {
        symbolsScanned: 1,
        opportunitiesFound: 1,
        qualifiedSignals: 1,
        tradesCreated: 1,
        signalsRejected: 0
      }
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

  private countPaperCryptoTradesToday(userId: UUID, dayKey: string): number {
    return [...this.store.trades.values()].filter(
      (trade) =>
        trade.userId === userId &&
        trade.symbol === dondieConfig.weekendEarnSymbol &&
        Boolean(trade.closedAt?.startsWith(dayKey))
    ).length;
  }
}

const tierFloor = (tier: DondieTier): number => {
  if (tier === "PRO") {
    return dondieConfig.weekendEarnProBonusUsd;
  }
  if (tier === "STANDARD") {
    return dondieConfig.weekendEarnStandardBonusUsd;
  }
  return dondieConfig.weekendEarnBaseUsd * 0.25;
};
