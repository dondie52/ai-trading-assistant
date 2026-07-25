import { Inject, Injectable } from "@nestjs/common";
import type { AutonomousBootstrapResult, JsonObject, Strategy, UUID } from "@trading/types";
import { PlatformService } from "../platform.service.js";
import {
  DEFAULT_AUTONOMOUS_UNIVERSE,
  isAgentManagedStrategy,
  selectAgentStrategyTemplate
} from "./agent-strategy-catalog.js";
import { DondieService } from "./dondie.service.js";

const ALPACA_DASHBOARD_URL = "https://app.alpaca.markets/";

@Injectable()
export class AutonomousBootstrapService {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(DondieService) private readonly dondie: DondieService
  ) {}

  /**
   * Hands-off mode: strategy, risk, watchlist, AUTOPILOT, and Dondie activation.
   * Operator capital stays in Alpaca — deposit and withdraw there.
   */
  async ensureAutonomousMode(userId: UUID): Promise<AutonomousBootstrapResult> {
    // Ensure portfolio / risk / watchlist rows exist before mutating them.
    this.platform.getRiskRules(userId);

    const existingAgent = this.dondie.getAgent(userId);
    const existingAutomation = this.platform.getAutomationSettings(userId);
    const alreadyBootstrapped = Boolean(
      existingAgent &&
        existingAgent.status === "ACTIVE" &&
        existingAutomation.mode === "AUTOPILOT" &&
        !existingAutomation.emergencyStop
    );

    const portfolio = this.platform.getPrimaryPortfolio(userId);
    const template = selectAgentStrategyTemplate(
      portfolio.portfolioValue || portfolio.cashBalance,
      existingAgent?.lastEvaluationScore
    );

    const risk = this.platform.updateRiskRules(userId, {
      maxRiskPerTradePercent: 1,
      maxDailyLossPercent: 3,
      maxDrawdownPercent: 12,
      maxPositionSizePercent: 15,
      stopTrading: false
    });

    const symbols = [...DEFAULT_AUTONOMOUS_UNIVERSE];
    this.platform.updateWatchlist(userId, { symbols });

    const strategy = this.ensureAgentManagedStrategy(userId, template.name, template.description, {
      ...template.configuration,
      templateId: template.id
    });

    const automation = this.platform.updateAutomationSettings(userId, {
      mode: "AUTOPILOT",
      emergencyStop: false,
      watchlist: symbols,
      marketHoursOnly: true,
      minimumConfidence:
        typeof template.configuration.confidenceThreshold === "number"
          ? template.configuration.confidenceThreshold
          : 65,
      maxTradesPerDay: 5,
      riskPerTradePercent: risk.maxRiskPerTradePercent,
      maxPositionSizePercent: risk.maxPositionSizePercent,
      dailyLossLimitPercent: risk.maxDailyLossPercent,
      maxDrawdownPercent: risk.maxDrawdownPercent,
      cooldownSeconds: 60,
      // Hands-off: do not ask for per-order confirmation
      requireConfirmationAboveValue: 1_000_000_000
    });

    const agent = await this.dondie.ensureActiveWithStrategy(userId, strategy.id);
    await this.dondie.updateSymbolUniverse(userId, { symbols });

    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      strategyTemplate: template.id,
      agentId: agent.id,
      agentStatus: agent.status,
      automationMode: automation.mode,
      watchlist: symbols,
      risk: {
        maxRiskPerTradePercent: risk.maxRiskPerTradePercent,
        maxDailyLossPercent: risk.maxDailyLossPercent,
        maxDrawdownPercent: risk.maxDrawdownPercent,
        maxPositionSizePercent: risk.maxPositionSizePercent
      },
      capitalGuidance: {
        deposit: "Fund your Alpaca account (paper or live). Dondie syncs buying power automatically.",
        withdraw: "When you see profit you want to take, withdraw from the Alpaca dashboard. This app does not hold your cash.",
        alpacaDashboardUrl: ALPACA_DASHBOARD_URL
      },
      alreadyBootstrapped
    };
  }

  private ensureAgentManagedStrategy(
    userId: UUID,
    name: string,
    description: string,
    configuration: JsonObject
  ): Strategy {
    const strategies = this.platform.listStrategies(userId);
    const managed = strategies.find((strategy) => isAgentManagedStrategy(strategy.configuration));
    if (managed) {
      return this.platform.updateStrategy(userId, managed.id, {
        name,
        description,
        status: "ACTIVE",
        configuration
      });
    }
    return this.platform.createStrategy(userId, {
      name,
      description,
      status: "ACTIVE",
      configuration
    });
  }
}
