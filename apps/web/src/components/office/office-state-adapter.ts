import type {
  AutomationRunResult,
  AutomationSettings,
  BrokerAccountView,
  DondieAgent,
  DondieLifestyleWorld,
  DondieMemory,
  Order,
  Portfolio,
  Position,
  RiskRules,
  Signal,
  Trade
} from "@trading/types";
import {
  OFFICE_ROLE_LABELS,
  type OfficeAgentState,
  type OfficeAgentStatus,
  type OfficeConnection,
  type OfficeRelatedEntity,
  type OfficeRole,
  type OfficeTimelineEntry,
  type OfficeWorld
} from "./office-types";

const RECENT_MS = 3 * 60 * 1000;

export type OfficeAdapterInput = {
  readonly now?: string | Date;
  readonly loading?: boolean;
  readonly fetchError?: boolean;
  readonly realtimeConnected?: boolean;
  readonly agent?: DondieAgent | null;
  readonly lifestyle?: DondieLifestyleWorld | null;
  readonly automation?: AutomationSettings | null;
  readonly lastAutomationRun?: AutomationRunResult | null;
  readonly signals?: readonly Signal[];
  readonly orders?: readonly Order[];
  readonly trades?: readonly Trade[];
  readonly positions?: readonly Position[];
  readonly portfolio?: Portfolio | null;
  readonly risk?: RiskRules | null;
  readonly brokers?: readonly BrokerAccountView[];
  readonly memories?: readonly DondieMemory[];
};

const asDate = (value: string | Date | undefined): Date =>
  value instanceof Date ? value : value ? new Date(value) : new Date();

const isRecent = (iso: string | undefined, now: Date): boolean => {
  if (!iso) {
    return false;
  }
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) {
    return false;
  }
  return now.getTime() - ts <= RECENT_MS;
};

const latestByTime = <T,>(items: readonly T[], getTime: (item: T) => string | undefined): T | undefined => {
  let best: T | undefined;
  let bestTs = -Infinity;
  for (const item of items) {
    const raw = getTime(item);
    if (!raw) {
      continue;
    }
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts) && ts >= bestTs) {
      best = item;
      bestTs = ts;
    }
  }
  return best;
};

const brokerConnected = (brokers: readonly BrokerAccountView[] | undefined): boolean =>
  (brokers ?? []).some(
    (account) =>
      account.status === "CONNECTED" && (account.hasCredentials || account.brokerName === "PAPER")
  );

const stepRunning = (run: AutomationRunResult | null | undefined, ids: readonly string[]): boolean =>
  Boolean(run?.steps?.some((step) => ids.includes(step.id) && step.status === "running"));

const stepFailed = (run: AutomationRunResult | null | undefined, ids: readonly string[]): boolean =>
  Boolean(run?.steps?.some((step) => ids.includes(step.id) && step.status === "failed"));

const priorityScore = (status: OfficeAgentStatus): number => {
  switch (status) {
    case "error":
      return 5;
    case "alert":
      return 4;
    case "working":
      return 3;
    case "waiting":
      return 2;
    case "offline":
      return 1;
    case "idle":
    default:
      return 0;
  }
};

const buildAgent = (
  role: OfficeRole,
  status: OfficeAgentStatus,
  activity: string,
  updatedAt: string,
  detailLines: readonly string[] = [],
  relatedEntity?: OfficeRelatedEntity
): OfficeAgentState => {
  if (relatedEntity) {
    return {
      role,
      label: OFFICE_ROLE_LABELS[role],
      status,
      activity,
      updatedAt,
      detailLines,
      relatedEntity
    };
  }
  return {
    role,
    label: OFFICE_ROLE_LABELS[role],
    status,
    activity,
    updatedAt,
    detailLines
  };
};

export const buildOfficeWorld = (input: OfficeAdapterInput): OfficeWorld => {
  const now = asDate(input.now);
  const nowIso = now.toISOString();
  const lifestyle = input.lifestyle ?? null;
  const agent = input.agent ?? null;
  const automation = input.automation ?? null;
  const run = input.lastAutomationRun ?? null;
  const signals = input.signals ?? [];
  const orders = input.orders ?? [];
  const trades = input.trades ?? [];
  const positions = input.positions ?? [];
  const memories = input.memories ?? [];
  const connected = brokerConnected(input.brokers);
  const latestSignal = latestByTime(signals, (item) => item.generatedAt);
  const latestOrder = latestByTime(orders, (item) => item.submittedAt);
  const latestTrade = latestByTime(trades, (item) => item.closedAt ?? item.openedAt);
  const latestMemory = memories[0];
  const openPositions = positions.filter((position) => Math.abs(position.quantity) > 0);
  const activity = lifestyle?.activity;
  const runtime = automation?.runtimeState;

  const connection: OfficeConnection = input.realtimeConnected
    ? "live"
    : input.fetchError
      ? "offline"
      : "polling";

  // --- Coordinator ---
  let coordinator = buildAgent(
    "coordinator",
    "idle",
    lifestyle?.currentTask ?? "Awaiting activation",
    lifestyle?.updatedAt ?? agent?.updatedAt ?? nowIso,
    [
      agent ? `Status ${agent.status}` : "Agent inactive",
      automation ? `Mode ${automation.mode}` : "Automation unknown",
      runtime ? `Runtime ${runtime}` : ""
    ].filter(Boolean)
  );

  if (!agent) {
    coordinator = buildAgent("coordinator", "offline", "Not activated", nowIso, [
      "Start hands-off mode — Dondie picks strategy and AUTOPILOT. Fund and withdraw in Alpaca."
    ]);
  } else if (agent.status === "SUSPENDED" || activity === "ERROR_RETRYING") {
    coordinator = buildAgent("coordinator", "error", "Needs operator attention", agent.updatedAt, [
      lifestyle?.lastEventSummary ?? "Agent suspended or retrying after error."
    ]);
  } else if (agent.status === "PAUSED" || activity === "SLEEPING" || runtime === "PAUSED") {
    coordinator = buildAgent("coordinator", "waiting", "Paused — waiting for resume", agent.updatedAt, [
      lifestyle?.lastEventSummary ?? "Survival loop paused."
    ]);
  } else if (
    activity === "EXECUTING" ||
    runtime === "RUNNING" ||
    stepRunning(run, ["sync", "watchlist"])
  ) {
    coordinator = buildAgent(
      "coordinator",
      "working",
      lifestyle?.currentTask ?? "Coordinating run",
      lifestyle?.updatedAt ?? nowIso,
      [lifestyle?.lastEventSummary ?? "Run in progress."].filter(Boolean),
      run?.signal?.id ? { type: "signal", id: run.signal.id } : undefined
    );
  } else if (
    activity === "BLOCKED_BY_RISK" ||
    runtime === "RISK_LOCK" ||
    runtime === "DAILY_LIMIT_REACHED"
  ) {
    coordinator = buildAgent(
      "coordinator",
      "alert",
      lifestyle?.activityLabel ?? "Blocked by controls",
      lifestyle?.updatedAt ?? nowIso,
      [lifestyle?.lastEventSummary ?? runtime ?? "Risk controls engaged."]
    );
  } else if (activity === "MARKET_CLOSED" || runtime === "WAITING_FOR_MARKET") {
    coordinator = buildAgent(
      "coordinator",
      "waiting",
      "Waiting for market open",
      lifestyle?.updatedAt ?? nowIso,
      [lifestyle?.lastEventSummary ?? "Market hours gate active."]
    );
  } else if (lifestyle?.currentTask) {
    coordinator = buildAgent(
      "coordinator",
      "idle",
      lifestyle.currentTask,
      lifestyle.updatedAt,
      [lifestyle.lastEventSummary].filter(Boolean)
    );
  }

  // --- Signal ---
  let signalAgent = buildAgent("signal", "idle", "No recent signal", nowIso, []);
  if (stepFailed(run, ["market", "strategy", "rank"])) {
    signalAgent = buildAgent("signal", "error", "Signal pipeline step failed", nowIso, [
      run?.reason ?? "Check automation run steps."
    ]);
  } else if (
    stepRunning(run, ["market", "strategy", "rank"]) ||
    activity === "ANALYSING" ||
    (latestSignal && isRecent(latestSignal.generatedAt, now))
  ) {
    signalAgent = buildAgent(
      "signal",
      "working",
      latestSignal
        ? `Scanning ${latestSignal.symbol} · ${latestSignal.signalType} ${latestSignal.confidenceScore}%`
        : "Scanning market / ranking setups",
      latestSignal?.generatedAt ?? lifestyle?.updatedAt ?? nowIso,
      latestSignal
        ? [`Model ${latestSignal.modelVersion}`, `Strategy ${latestSignal.strategyId.slice(0, 8)}…`]
        : [],
      latestSignal ? { type: "signal", id: latestSignal.id } : undefined
    );
  } else if (latestSignal) {
    signalAgent = buildAgent(
      "signal",
      "idle",
      `Last ${latestSignal.signalType} on ${latestSignal.symbol}`,
      latestSignal.generatedAt,
      [`Confidence ${latestSignal.confidenceScore}%`],
      { type: "signal", id: latestSignal.id }
    );
  }

  // --- Brain ---
  let brainAgent = buildAgent(
    "brain",
    "idle",
    agent ? `Tier ${agent.tier} standing by` : "Brain offline",
    agent?.updatedAt ?? nowIso,
    agent ? [`Cognition tier ${agent.tier}`] : []
  );
  if (!agent) {
    brainAgent = buildAgent("brain", "offline", "Awaiting agent activation", nowIso, []);
  } else if (activity === "THINKING" || Boolean(latestMemory && isRecent(latestMemory.createdAt, now))) {
    brainAgent = buildAgent(
      "brain",
      "working",
      latestMemory?.summary ?? "Evaluating strategy decision",
      latestMemory?.createdAt ?? lifestyle?.updatedAt ?? nowIso,
      [`Tier ${agent.tier}`, latestMemory ? "Latest run memory attached" : ""].filter(Boolean),
      latestMemory?.runId ? { type: "run", id: latestMemory.runId } : undefined
    );
  } else if (activity === "AWAITING_CONFIRMATION") {
    brainAgent = buildAgent(
      "brain",
      "waiting",
      "Plan ready — awaiting confirmation",
      lifestyle?.updatedAt ?? nowIso,
      [latestMemory?.summary ?? "Assisted mode confirmation required."].filter(Boolean)
    );
  } else if (latestMemory) {
    brainAgent = buildAgent(
      "brain",
      "idle",
      latestMemory.summary,
      latestMemory.createdAt,
      [`Tier ${agent.tier}`],
      latestMemory.runId ? { type: "run", id: latestMemory.runId } : undefined
    );
  }

  // --- Risk ---
  let riskAgent = buildAgent(
    "risk",
    "idle",
    "Rules idle",
    input.risk?.updatedAt ?? nowIso,
    input.risk?.stopTrading ? ["Trading halt flag set"] : ["Monitoring risk envelope"]
  );
  const riskRejected =
    latestOrder?.status === "REJECTED" ||
    latestOrder?.riskDecision?.approved === false ||
    stepFailed(run, ["risk"]);
  if (input.risk?.stopTrading || runtime === "RISK_LOCK" || activity === "BLOCKED_BY_RISK") {
    riskAgent = buildAgent(
      "risk",
      "alert",
      "Risk lock engaged",
      lifestyle?.updatedAt ?? input.risk?.updatedAt ?? nowIso,
      [
        input.risk?.stopTrading ? "stopTrading=true" : "",
        lifestyle?.lastEventSummary ?? "Orders blocked by risk controls."
      ].filter(Boolean),
      latestOrder ? { type: "order", id: latestOrder.id } : undefined
    );
  } else if (riskRejected) {
    riskAgent = buildAgent(
      "risk",
      "error",
      "Latest order failed risk checks",
      latestOrder?.submittedAt ?? nowIso,
      [
        latestOrder?.riskDecision?.rejections?.[0]?.code ??
          latestOrder?.riskDecision?.reasons?.[0] ??
          latestOrder?.status ??
          "RISK_REJECTED"
      ],
      latestOrder ? { type: "order", id: latestOrder.id } : undefined
    );
  } else if (stepRunning(run, ["risk"]) || activity === "PREPARING_ORDER") {
    riskAgent = buildAgent(
      "risk",
      "working",
      "Reviewing proposed order risk",
      lifestyle?.updatedAt ?? nowIso,
      [
        input.risk
          ? `Max risk/trade ${input.risk.maxRiskPerTradePercent}%`
          : "Risk rules loading"
      ],
      latestOrder ? { type: "order", id: latestOrder.id } : undefined
    );
  }

  // --- Broker ---
  let brokerAgent = buildAgent(
    "broker",
    connected ? "idle" : "offline",
    connected ? "Execution desk idle" : "Broker disconnected",
    nowIso,
    [connected ? "Broker linked" : "Connect paper or Alpaca in Settings"]
  );
  if (!connected || activity === "BROKER_DISCONNECTED" || runtime === "BROKER_DISCONNECTED") {
    brokerAgent = buildAgent("broker", "offline", "Broker disconnected", nowIso, [
      "No executable venue — connect a broker account."
    ]);
  } else if (activity === "AWAITING_CONFIRMATION") {
    brokerAgent = buildAgent(
      "broker",
      "waiting",
      "Awaiting approval to submit",
      lifestyle?.updatedAt ?? nowIso,
      [],
      latestOrder ? { type: "order", id: latestOrder.id } : undefined
    );
  } else if (
    stepRunning(run, ["order"]) ||
    activity === "EXECUTING" ||
    (latestOrder &&
      isRecent(latestOrder.submittedAt, now) &&
      (latestOrder.status === "PENDING" || latestOrder.status === "SUBMITTED"))
  ) {
    brokerAgent = buildAgent(
      "broker",
      "working",
      latestOrder
        ? `Executing ${latestOrder.side} ${latestOrder.symbol}`
        : "Submitting order",
      latestOrder?.submittedAt ?? nowIso,
      latestOrder ? [`Status ${latestOrder.status}`, `Mode ${latestOrder.mode}`] : [],
      latestOrder ? { type: "order", id: latestOrder.id } : undefined
    );
  } else if (
    latestOrder &&
    isRecent(latestOrder.submittedAt, now) &&
    latestOrder.status === "REJECTED"
  ) {
    brokerAgent = buildAgent(
      "broker",
      "error",
      `Order rejected · ${latestOrder.symbol}`,
      latestOrder.submittedAt,
      [`${latestOrder.side} ${latestOrder.status}`],
      { type: "order", id: latestOrder.id }
    );
  } else if (latestOrder && latestOrder.status === "FILLED") {
    brokerAgent = buildAgent(
      "broker",
      "idle",
      `Last fill ${latestOrder.side} ${latestOrder.symbol}`,
      latestOrder.submittedAt,
      [`Mode ${latestOrder.mode}`],
      { type: "order", id: latestOrder.id }
    );
  }

  // --- Portfolio ---
  let portfolioAgent = buildAgent(
    "portfolio",
    "idle",
    openPositions.length > 0
      ? `Monitoring ${openPositions.length} open position(s)`
      : "No open positions",
    input.portfolio?.createdAt ?? nowIso,
    input.portfolio
      ? [
          `Value ${input.portfolio.portfolioValue.toFixed(2)}`,
          `Unrealized ${input.portfolio.unrealizedPnl.toFixed(2)}`
        ]
      : []
  );
  if (stepFailed(run, ["portfolio"])) {
    portfolioAgent = buildAgent("portfolio", "error", "Portfolio sync failed", nowIso, [
      run?.reason ?? "Portfolio step failed."
    ]);
  } else if (
    stepRunning(run, ["portfolio"]) ||
    activity === "MONITORING" ||
    (openPositions.length > 0 && activity !== "SLEEPING")
  ) {
    const focus = openPositions[0];
    portfolioAgent = buildAgent(
      "portfolio",
      "working",
      focus
        ? `Monitoring ${focus.symbol} · qty ${focus.quantity}`
        : "Refreshing portfolio marks",
      lifestyle?.updatedAt ?? nowIso,
      input.portfolio
        ? [
            `Cash ${input.portfolio.cashBalance.toFixed(2)}`,
            `Unrealized ${input.portfolio.unrealizedPnl.toFixed(2)}`
          ]
        : [],
      focus ? { type: "position", id: focus.symbol } : undefined
    );
  } else if (activity === "CELEBRATING" && latestTrade) {
    portfolioAgent = buildAgent(
      "portfolio",
      "working",
      `Reviewing close ${latestTrade.symbol} · PnL ${latestTrade.pnl.toFixed(2)}`,
      latestTrade.closedAt ?? latestTrade.openedAt,
      [`Side ${latestTrade.side}`],
      { type: "order", id: latestTrade.orderId }
    );
  } else if (latestTrade) {
    portfolioAgent = buildAgent(
      "portfolio",
      "idle",
      `Last trade ${latestTrade.symbol}`,
      latestTrade.closedAt ?? latestTrade.openedAt,
      [`PnL ${latestTrade.pnl.toFixed(2)}`]
    );
  }

  const agents: Record<OfficeRole, OfficeAgentState> = {
    coordinator,
    signal: signalAgent,
    brain: brainAgent,
    risk: riskAgent,
    broker: brokerAgent,
    portfolio: portfolioAgent
  };

  const activeRoles = (Object.keys(agents) as OfficeRole[])
    .filter((role) => role !== "coordinator")
    .sort((a, b) => priorityScore(agents[b].status) - priorityScore(agents[a].status));
  const coordinatorAt =
    priorityScore(agents[activeRoles[0] ?? "signal"].status) > 0
      ? (activeRoles[0] ?? "coordinator")
      : "coordinator";

  const timeline: OfficeTimelineEntry[] = [];
  const pushTimeline = (role: OfficeRole, at: string, text: string, id: string): void => {
    timeline.push({ id, at, role, text });
  };

  if (latestSignal) {
    pushTimeline(
      "signal",
      latestSignal.generatedAt,
      `${latestSignal.signalType} ${latestSignal.symbol} @ ${latestSignal.confidenceScore}%`,
      `signal-${latestSignal.id}`
    );
  }
  if (latestMemory) {
    pushTimeline("brain", latestMemory.createdAt, latestMemory.summary, `memory-${latestMemory.id}`);
  }
  if (latestOrder) {
    pushTimeline(
      latestOrder.status === "REJECTED" ? "risk" : "broker",
      latestOrder.submittedAt,
      `${latestOrder.side} ${latestOrder.symbol} → ${latestOrder.status}`,
      `order-${latestOrder.id}`
    );
  }
  if (latestTrade) {
    pushTimeline(
      "portfolio",
      latestTrade.closedAt ?? latestTrade.openedAt,
      `Trade ${latestTrade.symbol} PnL ${latestTrade.pnl.toFixed(2)}`,
      `trade-${latestTrade.id}`
    );
  }
  if (lifestyle?.lastEventSummary) {
    pushTimeline(
      "coordinator",
      lifestyle.updatedAt,
      lifestyle.lastEventSummary,
      `lifestyle-${lifestyle.updatedAt}`
    );
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const night =
    activity === "SLEEPING" ||
    activity === "RESTING" ||
    activity === "MARKET_CLOSED" ||
    runtime === "WAITING_FOR_MARKET" ||
    runtime === "PAUSED";

  return {
    agents,
    coordinatorAt,
    lifestyleLevel: lifestyle?.lifestyleLevel ?? 1,
    night,
    paperMode: lifestyle?.paperTradingLabel !== "LIVE",
    connection,
    loading: Boolean(input.loading) && !lifestyle && !agent,
    error: input.fetchError && !lifestyle && !agent ? "Unable to load office state." : null,
    timeline: timeline.slice(0, 12),
    agentActive: Boolean(agent && agent.status === "ACTIVE")
  };
};
