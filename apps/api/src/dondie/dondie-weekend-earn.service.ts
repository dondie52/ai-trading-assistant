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

const roundUsd = (value: number): number => Number(value.toFixed(4));
const roundPrice = (value: number): number => Number(value.toFixed(2));

/** Deterministic 0..1 salt so tests stay stable for a given agent/day/run/channel. */
const runSalt = (agentId: UUID, dayKey: string, runIndex: number, channel = "default"): number => {
  let hash = 0;
  const seed = `${agentId}:${dayKey}:${runIndex}:${channel}`;
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
    // Independent channels — a single salt made BUY (salt>=0.48) almost always lose
    // for FREE tier (win when salt<0.52), so BUY win rate collapsed to ~8%.
    const sideSalt = runSalt(agent.id, dayKey, runIndex, "side");
    const outcomeSalt = runSalt(agent.id, dayKey, runIndex, "outcome");
    const priceSalt = runSalt(agent.id, dayKey, runIndex, "price");
    const moveSalt = runSalt(agent.id, dayKey, runIndex, "move");
    // Stamp the gig on the calendar day being earned — wall-clock "now" breaks
    // daily caps / creditedToday when tests or schedulers pass a specific `at`.
    const now = at.toISOString();
    const symbol = dondieConfig.weekendEarnSymbol;
    const strategyId = agent.strategyId ?? agent.id;
    const remainingDailyCap = Math.max(
      0,
      roundUsd(dondieConfig.weekendEarnMaxPerDayUsd - this.creditedToday(agent.id, dayKey))
    );

    this.store.ensureDefaultAccountState(userId);
    const portfolio = [...this.store.portfolios.values()].find((entry) => entry.userId === userId);
    if (!portfolio) {
      throw new Error("Weekend crypto desk requires a portfolio.");
    }

    const side = sideSalt >= 0.48 ? "BUY" : "SELL";
    const entryPrice = roundPrice(64_000 + (priceSalt - 0.5) * 2_400);
    // Size to the real stake (e.g. $10) — never pretend a $640 BTC lot.
    const stakeCash = Math.max(0, portfolio.cashBalance);
    const notional = Math.min(Math.max(stakeCash * 0.85, stakeCash > 0 ? 1 : 0), Math.max(stakeCash, 0));
    const quantity = entryPrice > 0 && notional > 0 ? Number((notional / entryPrice).toFixed(6)) : 0;
    const movePct = 0.0012 + moveSalt * 0.0038;
    const won = outcomeSalt < winChanceForTier(agent.tier);
    const signedMove = won ? movePct : -movePct;
    const exitPrice = roundPrice(entryPrice * (1 + (side === "BUY" ? signedMove : -signedMove)));
    const grossPnl =
      quantity > 0
        ? roundUsd(quantity * (side === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice))
        : 0;
    const walletCredit =
      grossPnl > 0
        ? roundUsd(
            Math.min(
              remainingDailyCap,
              Math.max(0.01, grossPnl * 0.5 + Math.min(0.05, tierFloor(agent.tier) * 0.15))
            )
          )
        : 0;

    if (!(quantity > 0)) {
      const emptySignal: Signal = {
        id: randomUUID(),
        userId,
        strategyId,
        symbol,
        signalType: "HOLD",
        confidenceScore: 40,
        modelVersion: dondieConfig.weekendEarnBrain,
        features: { weekendGig: true, venue: "PAPER_CRYPTO", skipped: "NO_CASH" },
        generatedAt: now
      };
      return {
        agentId: agent.id,
        tier: agent.tier,
        symbol,
        brain: dondieConfig.weekendEarnBrain,
        reasoning: "Weekend paper BTC skipped — stake cash is $0. Fund the account with your real $10 first.",
        automation: {
          status: "SKIPPED",
          mode: "AUTO",
          strategyId,
          symbol,
          signal: emptySignal,
          reason: "No cash available to size a micro BTC paper scalp."
        },
        walletBalance: agent.walletBalance,
        ranAt: now
      };
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
      confidenceScore: Math.round(58 + outcomeSalt * 20),
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

    const alpacaConnected = [...this.store.brokerAccounts.values()].some(
      (account) =>
        account.userId === userId &&
        account.brokerName === "ALPACA" &&
        Boolean(account.encryptedApiKey && account.encryptedSecret)
    );

    // When Alpaca owns the book, never invent local FILLED orders/trades — only credit the survival wallet.
    if (alpacaConnected) {
      let updatedAgent = agent;
      if (walletCredit > 0) {
        updatedAgent = await this.wallet.credit(
          agent,
          walletCredit,
          dondieConfig.weekendEarnLedgerReason,
          {
            symbol,
            side,
            grossPnl,
            entryPrice,
            exitPrice,
            weekend: true,
            venue: "WALLET_ONLY",
            remainingDailyCap: roundUsd(remainingDailyCap - walletCredit)
          },
          at
        );
      }
      updatedAgent = {
        ...updatedAgent,
        lastRunAt: now,
        updatedAt: now
      };
      this.store.dondieAgents.set(updatedAgent.id, updatedAgent);

      const reasoning =
        walletCredit > 0
          ? `Weekend desk simulated BTCUSD ${side} for wallet +$${walletCredit.toFixed(2)} (not submitted to Alpaca).`
          : `Weekend desk skipped Alpaca submission — wallet credit $0 this scalp.`;

      return {
        agentId: agent.id,
        tier: updatedAgent.tier,
        symbol,
        brain: dondieConfig.weekendEarnBrain,
        reasoning,
        automation: {
          status: "SKIPPED",
          mode: "AUTO",
          strategyId,
          symbol,
          signal,
          reason: reasoning,
          summary: {
            symbolsScanned: 1,
            opportunitiesFound: 1,
            qualifiedSignals: 1,
            tradesCreated: 0,
            signalsRejected: 0
          }
        },
        walletBalance: updatedAgent.walletBalance,
        ranAt: now
      };
    }

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
      updatedAgent = await this.wallet.credit(
        agent,
        walletCredit,
        dondieConfig.weekendEarnLedgerReason,
        {
          symbol,
          side,
          grossPnl,
          entryPrice,
          exitPrice,
          weekend: true,
          venue: "PAPER_CRYPTO",
          remainingDailyCap: roundUsd(remainingDailyCap - walletCredit)
        },
        at
      );
    }

    updatedAgent = {
      ...updatedAgent,
      lastRunAt: now,
      updatedAt: now
    };
    this.store.dondieAgents.set(updatedAgent.id, updatedAgent);

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
