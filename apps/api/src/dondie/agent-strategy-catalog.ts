import type { JsonObject } from "@trading/types";

export type AgentStrategyTemplateId =
  | "conservative_swing"
  | "momentum"
  | "trend_following"
  | "mean_reversion";

export interface AgentStrategyTemplate {
  readonly id: AgentStrategyTemplateId;
  readonly name: string;
  readonly description: string;
  readonly configuration: JsonObject;
}

const AGENT_MANAGED_FLAG = true;

export const DEFAULT_AUTONOMOUS_UNIVERSE = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
  "SPY",
  "QQQ",
  // Gold exposure via SPDR Gold Shares — Alpaca trades it like any other equity/ETF.
  "GLD"
] as const;

export const AGENT_STRATEGY_TEMPLATES: readonly AgentStrategyTemplate[] = [
  {
    id: "conservative_swing",
    name: "Agent Managed — Conservative Swing",
    description: "Lower risk swing defaults chosen by Dondie for smaller accounts.",
    configuration: {
      agentManaged: AGENT_MANAGED_FLAG,
      template: "Conservative swing",
      automationMode: "AUTO",
      timeframe: "4h",
      riskProfile: "conservative",
      riskPercent: 0.5,
      confidenceThreshold: 65,
      stopLossPercent: 3,
      takeProfitPercent: 6,
      indicators: ["EMA", "RSI", "ATR"]
    }
  },
  {
    id: "momentum",
    name: "Agent Managed — Momentum",
    description: "Momentum defaults for mid-size accounts with room to trade trends.",
    configuration: {
      agentManaged: AGENT_MANAGED_FLAG,
      template: "Momentum",
      automationMode: "AUTO",
      timeframe: "1h",
      riskProfile: "balanced",
      riskPercent: 1,
      confidenceThreshold: 62,
      stopLossPercent: 4,
      takeProfitPercent: 8,
      indicators: ["EMA", "RSI", "MACD"]
    }
  },
  {
    id: "trend_following",
    name: "Agent Managed — Trend Following",
    description: "Trend-following defaults when equity supports holding directional moves.",
    configuration: {
      agentManaged: AGENT_MANAGED_FLAG,
      template: "Trend following",
      automationMode: "AUTO",
      timeframe: "4h",
      riskProfile: "balanced",
      riskPercent: 1,
      confidenceThreshold: 60,
      stopLossPercent: 5,
      takeProfitPercent: 10,
      indicators: ["EMA", "MACD", "ATR"]
    }
  },
  {
    id: "mean_reversion",
    name: "Agent Managed — Mean Reversion",
    description: "Mean-reversion defaults when recent evaluation scores are weak on trend templates.",
    configuration: {
      agentManaged: AGENT_MANAGED_FLAG,
      template: "Mean reversion",
      automationMode: "AUTO",
      timeframe: "1h",
      riskProfile: "balanced",
      riskPercent: 0.75,
      confidenceThreshold: 68,
      stopLossPercent: 3,
      takeProfitPercent: 5,
      indicators: ["RSI", "BB", "EMA"]
    }
  }
];

/**
 * Dondie picks the strategy template — no human strategy selection required.
 * Equity and recent evaluation score drive the choice.
 */
export const selectAgentStrategyTemplate = (
  equity: number,
  lastEvaluationScore?: number
): AgentStrategyTemplate => {
  if (typeof lastEvaluationScore === "number" && lastEvaluationScore < 40) {
    return AGENT_STRATEGY_TEMPLATES.find((template) => template.id === "mean_reversion")!;
  }
  if (equity > 0 && equity < 5_000) {
    return AGENT_STRATEGY_TEMPLATES.find((template) => template.id === "conservative_swing")!;
  }
  if (equity >= 25_000) {
    return AGENT_STRATEGY_TEMPLATES.find((template) => template.id === "trend_following")!;
  }
  return AGENT_STRATEGY_TEMPLATES.find((template) => template.id === "momentum")!;
};

export const isAgentManagedStrategy = (configuration: JsonObject): boolean =>
  configuration.agentManaged === true;
