import type {
  DondieAchievement,
  DondieActivityState,
  DondieAgent,
  DondieLifestyleLevel,
  DondieLifestyleWorld,
  DondieMood,
  DondieRoomTiers,
  DondieTier,
  Order,
  Trade
} from "@trading/types";

export interface DondieLifestyleInput {
  readonly agent: DondieAgent | null | undefined;
  readonly trades: readonly Trade[];
  readonly orders: readonly Order[];
  readonly completedRuns: number;
  readonly brokerConnected: boolean;
  readonly riskLocked: boolean;
  readonly automationPaused: boolean;
  readonly marketOpen: boolean;
  /** Weekend crypto-desk side hustle while US equities are closed. */
  readonly weekendSideHustle?: boolean;
  readonly recentSignalSymbol?: string;
  readonly awaitingConfirmation?: boolean;
  readonly isExecuting?: boolean;
  readonly hasOpenPositions?: boolean;
  readonly paperMode?: boolean;
  readonly now?: string;
}

const lifestyleThresholds: readonly {
  readonly level: DondieLifestyleLevel;
  readonly walletRequired: number;
  readonly label: string;
}[] = [
  { level: 1, walletRequired: 0, label: "Starter — survival mode" },
  { level: 2, walletRequired: 25, label: "Improving" },
  { level: 3, walletRequired: 100, label: "Standard trader" },
  { level: 4, walletRequired: 250, label: "Pro setup" },
  { level: 5, walletRequired: 500, label: "Elite" }
];

const activityLabels: Record<DondieActivityState, string> = {
  IDLE: "Idle at desk",
  SLEEPING: "Sleeping",
  RESTING: "Resting",
  THINKING: "Thinking",
  ANALYSING: "Analysing charts",
  PREPARING_ORDER: "Preparing an order",
  AWAITING_CONFIRMATION: "Awaiting confirmation",
  EXECUTING: "Executing a paper trade",
  MONITORING: "Monitoring a position",
  CELEBRATING: "Celebrating a good result",
  BLOCKED_BY_RISK: "Blocked by risk rules",
  BROKER_DISCONNECTED: "Broker disconnected",
  MARKET_CLOSED: "Market closed — waiting",
  SIDE_HUSTLE: "Weekend crypto desk — earning",
  ERROR_RETRYING: "Error — retrying"
};

const clampLevel = (value: number): DondieLifestyleLevel => {
  if (value <= 1) {
    return 1;
  }
  if (value >= 5) {
    return 5;
  }
  return value as DondieLifestyleLevel;
};

export const resolveLifestyleLevel = (walletBalance: number): DondieLifestyleLevel => {
  let level: DondieLifestyleLevel = 1;
  for (const tier of lifestyleThresholds) {
    if (walletBalance >= tier.walletRequired) {
      level = tier.level;
    }
  }
  return level;
};

export const resolveRoomTiers = (
  lifestyleLevel: DondieLifestyleLevel,
  brainTier: DondieTier
): DondieRoomTiers => {
  const brainBoost = brainTier === "PRO" ? 1 : brainTier === "STANDARD" ? 0 : 0;
  const bump = (base: number): DondieLifestyleLevel => clampLevel(base + brainBoost);
  return {
    room: lifestyleLevel,
    desk: lifestyleLevel,
    chair: clampLevel(Math.max(1, lifestyleLevel - (lifestyleLevel >= 4 ? 0 : 0))),
    monitor: bump(lifestyleLevel),
    bed: clampLevel(Math.max(1, lifestyleLevel - (lifestyleLevel === 1 ? 0 : 0))),
    decor: clampLevel(Math.max(1, lifestyleLevel - 1)),
    lighting: lifestyleLevel
  };
};

export const resolveNextUnlock = (
  walletBalance: number,
  lifestyleLevel: DondieLifestyleLevel
): DondieLifestyleWorld["nextUnlock"] => {
  const current = lifestyleThresholds.find((tier) => tier.level === lifestyleLevel) ?? lifestyleThresholds[0]!;
  const next = lifestyleThresholds.find((tier) => tier.level === lifestyleLevel + 1);
  if (!next) {
    return {
      level: null,
      label: "Elite lifestyle unlocked",
      walletRequired: current.walletRequired,
      progressPercent: 100
    };
  }
  const span = next.walletRequired - current.walletRequired;
  const gained = Math.max(0, walletBalance - current.walletRequired);
  const progressPercent = span <= 0 ? 100 : Math.min(100, Math.round((gained / span) * 100));
  return {
    level: next.level,
    label: `Next upgrade at $${next.walletRequired} wallet — ${next.label}`,
    walletRequired: next.walletRequired,
    progressPercent
  };
};

const consecutiveProfits = (trades: readonly Trade[]): number => {
  const closed = [...trades]
    .filter((trade) => Boolean(trade.closedAt))
    .sort((left, right) => (right.closedAt ?? "").localeCompare(left.closedAt ?? ""));
  let streak = 0;
  for (const trade of closed) {
    if (trade.pnl > 0) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
};

export const resolveDondieAchievements = (input: {
  readonly closedTrades: number;
  readonly profitableTrades: number;
  readonly completedRuns: number;
  readonly cumulativePaperProfit: number;
  readonly riskApprovedOrders: number;
  readonly walletBalance: number;
}): readonly DondieAchievement[] => {
  const defs: readonly Omit<DondieAchievement, "unlocked" | "unlockedAt">[] = [
    {
      id: "first-profit",
      title: "First profitable paper trade",
      description: "Closed a paper trade with positive PnL."
    },
    {
      id: "five-profits",
      title: "Five successful paper trades",
      description: "Built consistency with five winning closes."
    },
    {
      id: "risk-discipline",
      title: "Risk discipline",
      description: "Three or more orders approved within risk limits."
    },
    {
      id: "ten-runs",
      title: "Ten automation runs",
      description: "Completed ten Dondie or automation cycles."
    },
    {
      id: "positive-week",
      title: "Positive paper P&L",
      description: "Cumulative closed paper profit is above zero."
    },
    {
      id: "standard-brain",
      title: "STANDARD brain unlocked",
      description: "Wallet reached the STANDARD cognition threshold."
    }
  ];

  return defs.map((item) => {
    const unlocked =
      (item.id === "first-profit" && input.profitableTrades >= 1) ||
      (item.id === "five-profits" && input.profitableTrades >= 5) ||
      (item.id === "risk-discipline" && input.riskApprovedOrders >= 3) ||
      (item.id === "ten-runs" && input.completedRuns >= 10) ||
      (item.id === "positive-week" && input.cumulativePaperProfit > 0) ||
      (item.id === "standard-brain" && input.walletBalance >= 25);
    return {
      ...item,
      unlocked
    };
  });
};

export const resolveDondieActivity = (input: {
  readonly agent: DondieAgent | null | undefined;
  readonly riskLocked: boolean;
  readonly brokerConnected: boolean;
  readonly marketOpen: boolean;
  readonly automationPaused: boolean;
  readonly weekendSideHustle?: boolean;
  readonly awaitingConfirmation?: boolean;
  readonly isExecuting?: boolean;
  readonly hasOpenPositions?: boolean;
  readonly recentSignalSymbol?: string;
  readonly lastTradePnl?: number;
}): { readonly activity: DondieActivityState; readonly mood: DondieMood; readonly currentTask: string } => {
  if (!input.agent) {
    return {
      activity: "IDLE",
      mood: "waiting",
      currentTask: "Waiting for activation"
    };
  }
  if (input.riskLocked) {
    return {
      activity: "BLOCKED_BY_RISK",
      mood: "blocked",
      currentTask: "Risk lock active — trading paused"
    };
  }
  if (!input.brokerConnected) {
    return {
      activity: "BROKER_DISCONNECTED",
      mood: "blocked",
      currentTask: "Reconnect broker to resume work"
    };
  }
  if (input.agent.status === "PAUSED" || input.automationPaused) {
    return {
      activity: "SLEEPING",
      mood: "tired",
      currentTask: "Resting while automation is paused"
    };
  }
  if (input.agent.status === "SUSPENDED") {
    return {
      activity: "ERROR_RETRYING",
      mood: "cautious",
      currentTask: "Suspended — needs operator attention"
    };
  }
  if (input.weekendSideHustle) {
    return {
      activity: "SIDE_HUSTLE",
      mood: "optimistic",
      currentTask: "Weekend crypto desk — earning for the survival wallet"
    };
  }
  if (!input.marketOpen) {
    return {
      activity: "MARKET_CLOSED",
      mood: "waiting",
      currentTask: "Waiting for market hours"
    };
  }
  if (input.isExecuting) {
    return {
      activity: "EXECUTING",
      mood: "focused",
      currentTask: input.recentSignalSymbol
        ? `Executing paper trade on ${input.recentSignalSymbol}`
        : "Executing paper trade"
    };
  }
  if (input.awaitingConfirmation) {
    return {
      activity: "AWAITING_CONFIRMATION",
      mood: "cautious",
      currentTask: "Order ready — awaiting confirmation"
    };
  }
  if (input.recentSignalSymbol) {
    return {
      activity: "ANALYSING",
      mood: "focused",
      currentTask: `Analysing ${input.recentSignalSymbol}`
    };
  }
  if (typeof input.lastTradePnl === "number" && input.lastTradePnl > 0) {
    return {
      activity: "CELEBRATING",
      mood: "celebrating",
      currentTask: "Celebrating a profitable paper close"
    };
  }
  if (input.hasOpenPositions) {
    return {
      activity: "MONITORING",
      mood: "focused",
      currentTask: "Monitoring open paper positions"
    };
  }
  if (input.agent.lastRunAt) {
    return {
      activity: "THINKING",
      mood: "calm",
      currentTask: "Reviewing last survival run"
    };
  }
  return {
    activity: "IDLE",
    mood: "calm",
    currentTask: "Ready for the next survival cycle"
  };
};

export const buildDondieLifestyleWorld = (input: DondieLifestyleInput): DondieLifestyleWorld => {
  const now = input.now ?? new Date().toISOString();
  const walletBalance = input.agent?.walletBalance ?? 0;
  const brainTier = input.agent?.tier ?? "FREE";
  const lifestyleLevel = resolveLifestyleLevel(walletBalance);
  const lifestyleMeta =
    lifestyleThresholds.find((tier) => tier.level === lifestyleLevel) ?? lifestyleThresholds[0]!;
  const closedTrades = input.trades.filter((trade) => Boolean(trade.closedAt));
  const profitableTrades = closedTrades.filter((trade) => trade.pnl > 0);
  const cumulativePaperProfit = closedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const lastTrade = [...closedTrades].sort((left, right) =>
    (right.closedAt ?? "").localeCompare(left.closedAt ?? "")
  )[0];
  const riskApprovedOrders = input.orders.filter(
    (order) => order.riskDecision.approved && order.status !== "REJECTED"
  ).length;
  const activityBundle = resolveDondieActivity({
    agent: input.agent,
    riskLocked: input.riskLocked,
    brokerConnected: input.brokerConnected,
    marketOpen: input.marketOpen,
    automationPaused: input.automationPaused,
    ...(input.weekendSideHustle !== undefined ? { weekendSideHustle: input.weekendSideHustle } : {}),
    ...(input.awaitingConfirmation !== undefined
      ? { awaitingConfirmation: input.awaitingConfirmation }
      : {}),
    ...(input.isExecuting !== undefined ? { isExecuting: input.isExecuting } : {}),
    ...(input.hasOpenPositions !== undefined ? { hasOpenPositions: input.hasOpenPositions } : {}),
    ...(input.recentSignalSymbol !== undefined ? { recentSignalSymbol: input.recentSignalSymbol } : {}),
    ...(lastTrade ? { lastTradePnl: lastTrade.pnl } : {})
  });

  const lastEventSummary = input.agent
    ? input.agent.lastRunAt
      ? `Last run ${new Date(input.agent.lastRunAt).toLocaleString()}${
          typeof input.agent.lastEvaluationScore === "number"
            ? ` · score ${input.agent.lastEvaluationScore}`
            : ""
        }`
      : "No survival runs yet"
    : "Dondie is not activated";

  return {
    ...(input.agent ? { agentId: input.agent.id } : {}),
    lifestyleLevel,
    lifestyleLabel: `Lifestyle Level ${lifestyleLevel} — ${lifestyleMeta.label}`,
    walletBalance,
    paperTradingLabel: input.paperMode === false ? "LIVE" : "PAPER",
    brainTier,
    mood: activityBundle.mood,
    activity: activityBundle.activity,
    activityLabel: activityLabels[activityBundle.activity],
    currentTask: activityBundle.currentTask,
    lastEventSummary,
    ...(lastTrade
      ? {
          lastTradeResult: {
            symbol: lastTrade.symbol,
            pnl: lastTrade.pnl,
            side: lastTrade.side,
            ...(lastTrade.closedAt ? { closedAt: lastTrade.closedAt } : {})
          }
        }
      : {}),
    room: resolveRoomTiers(lifestyleLevel, brainTier),
    nextUnlock: resolveNextUnlock(walletBalance, lifestyleLevel),
    achievements: resolveDondieAchievements({
      closedTrades: closedTrades.length,
      profitableTrades: profitableTrades.length,
      completedRuns: input.completedRuns,
      cumulativePaperProfit,
      riskApprovedOrders,
      walletBalance
    }),
    stats: {
      completedRuns: input.completedRuns,
      closedTrades: closedTrades.length,
      profitableTrades: profitableTrades.length,
      consecutiveProfitableTrades: consecutiveProfits(input.trades),
      cumulativePaperProfit
    },
    disclaimer:
      "Dondie’s room visualizes cognition wallet and paper-trading progress. It is not a promise of real-world profit.",
    updatedAt: now
  };
};
