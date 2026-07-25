import { describe, expect, it } from "vitest";
import type {
  AutomationSettings,
  DondieAgent,
  DondieLifestyleWorld,
  Order,
  Signal
} from "@trading/types";
import { buildOfficeWorld } from "./office-state-adapter";

const baseAgent = {
  id: "agent-1",
  userId: "user-1",
  name: "Dondie",
  tier: "FREE",
  status: "ACTIVE",
  walletBalance: 12,
  scheduleMinutes: 15,
  symbolUniverse: ["AAPL"],
  createdAt: "2026-07-25T10:00:00.000Z",
  updatedAt: "2026-07-25T12:00:00.000Z"
} as DondieAgent;

const baseLifestyle = {
  lifestyleLevel: 2,
  lifestyleLabel: "Improving",
  walletBalance: 12,
  paperTradingLabel: "PAPER",
  brainTier: "FREE",
  mood: "focused",
  activity: "ANALYSING",
  activityLabel: "Analysing charts",
  currentTask: "Evaluating AAPL setup",
  lastEventSummary: "Signal generated for AAPL",
  room: {
    room: 2,
    desk: 2,
    chair: 2,
    monitor: 2,
    bed: 2,
    decor: 2,
    lighting: 2
  },
  nextUnlock: {
    level: 3,
    label: "Reach $100",
    walletRequired: 100,
    progressPercent: 12
  },
  achievements: [],
  stats: {
    completedRuns: 3,
    closedTrades: 1,
    profitableTrades: 1,
    consecutiveProfitableTrades: 1,
    cumulativePaperProfit: 4
  },
  disclaimer: "Paper only",
  updatedAt: "2026-07-25T12:00:00.000Z"
} as DondieLifestyleWorld;

describe("buildOfficeWorld", () => {
  it("maps a recent signal onto the signal desk as working", () => {
    const signal = {
      id: "sig-1",
      userId: "user-1",
      strategyId: "strat-1",
      symbol: "AAPL",
      signalType: "BUY",
      confidenceScore: 72,
      modelVersion: "v1",
      features: {},
      generatedAt: "2026-07-25T12:00:00.000Z"
    } as Signal;

    const world = buildOfficeWorld({
      now: "2026-07-25T12:01:00.000Z",
      agent: baseAgent,
      lifestyle: baseLifestyle,
      signals: [signal],
      realtimeConnected: true
    });

    expect(world.agents.signal.status).toBe("working");
    expect(world.agents.signal.relatedEntity).toEqual({ type: "signal", id: "sig-1" });
    expect(world.connection).toBe("live");
    expect(world.coordinatorAt).toBe("signal");
  });

  it("marks risk alert when lifestyle is blocked by risk", () => {
    const world = buildOfficeWorld({
      now: "2026-07-25T12:01:00.000Z",
      agent: baseAgent,
      lifestyle: {
        ...baseLifestyle,
        activity: "BLOCKED_BY_RISK",
        activityLabel: "Blocked by risk rules",
        currentTask: "Risk lock"
      },
      risk: {
        id: "risk-1",
        userId: "user-1",
        maxRiskPerTradePercent: 1,
        maxDailyLossPercent: 3,
        maxDrawdownPercent: 10,
        maxPositionSizePercent: 10,
        stopTrading: true,
        updatedAt: "2026-07-25T12:00:00.000Z"
      },
      automation: {
        runtimeState: "RISK_LOCK",
        mode: "ASSISTED"
      } as AutomationSettings
    });

    expect(world.agents.risk.status).toBe("alert");
    expect(world.agents.coordinator.status).toBe("alert");
    expect(world.coordinatorAt).toBe("risk");
  });

  it("marks broker offline when accounts are disconnected", () => {
    const world = buildOfficeWorld({
      now: "2026-07-25T12:01:00.000Z",
      agent: baseAgent,
      lifestyle: { ...baseLifestyle, activity: "IDLE", activityLabel: "Idle at desk" },
      brokers: [
        {
          id: "b1",
          userId: "user-1",
          brokerName: "PAPER",
          accountId: "paper-1",
          status: "DISCONNECTED",
          hasCredentials: false,
          createdAt: "2026-07-25T10:00:00.000Z"
        }
      ]
    });

    expect(world.agents.broker.status).toBe("offline");
  });

  it("activates broker desk from a pending order", () => {
    const order = {
      id: "ord-1",
      userId: "user-1",
      brokerAccountId: "b1",
      symbol: "AAPL",
      side: "BUY",
      orderType: "LIMIT",
      mode: "AUTO",
      quantity: 1,
      price: 100,
      stopLoss: 95,
      takeProfit: 110,
      status: "SUBMITTED",
      submittedAt: "2026-07-25T12:00:30.000Z",
      riskDecision: {
        approved: true,
        reasons: [],
        maxRiskAmount: 10,
        proposedRiskAmount: 5,
        proposedPositionValue: 100,
        calculatedQuantity: 1
      }
    } as Order;

    const world = buildOfficeWorld({
      now: "2026-07-25T12:01:00.000Z",
      agent: baseAgent,
      lifestyle: {
        ...baseLifestyle,
        activity: "EXECUTING",
        activityLabel: "Executing a paper trade"
      },
      orders: [order],
      brokers: [
        {
          id: "b1",
          userId: "user-1",
          brokerName: "PAPER",
          accountId: "paper-1",
          status: "CONNECTED",
          hasCredentials: true,
          createdAt: "2026-07-25T10:00:00.000Z"
        }
      ]
    });

    expect(world.agents.broker.status).toBe("working");
    expect(world.agents.broker.relatedEntity?.id).toBe("ord-1");
    expect(world.timeline.some((entry) => entry.text.includes("AAPL"))).toBe(true);
  });

  it("returns offline coordinator when agent is missing", () => {
    const world = buildOfficeWorld({
      now: "2026-07-25T12:01:00.000Z",
      loading: false,
      fetchError: false
    });
    expect(world.agents.coordinator.status).toBe("offline");
    expect(world.agentActive).toBe(false);
  });

  it("lights up desks during weekend paper BTC side hustle", () => {
    const world = buildOfficeWorld({
      now: "2026-07-25T15:00:00.000Z",
      agent: baseAgent,
      lifestyle: {
        ...baseLifestyle,
        activity: "SIDE_HUSTLE",
        activityLabel: "Weekend paper BTC — trading",
        currentTask: "Paper-trading BTCUSD while equities sleep",
        mood: "optimistic"
      },
      automation: {
        mode: "AUTOPILOT",
        runtimeState: "RUNNING"
      } as AutomationSettings
    });

    expect(world.agents.coordinator.status).toBe("working");
    expect(world.agents.signal.status).toBe("working");
    expect(world.agents.brain.status).toBe("working");
    expect(world.agents.coordinator.activity.toLowerCase()).toContain("btcusd");
    expect(world.night).toBe(false);
  });
});
