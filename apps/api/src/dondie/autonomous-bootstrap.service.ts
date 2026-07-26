import { Inject, Injectable } from "@nestjs/common";
import type { AutonomousBootstrapResult, JsonObject, Strategy, UUID } from "@trading/types";
import { PlatformService } from "../platform.service.js";
import {
  DEFAULT_AUTONOMOUS_UNIVERSE,
  isAgentManagedStrategy,
  selectAgentStrategyTemplate
} from "./agent-strategy-catalog.js";
import { dondieConfig, isDondieFullPower } from "./dondie.config.js";
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
   * When DONDIE_FULL_POWER=true, Dondie keeps choosing strategy and runs at max AI autonomy.
   */
  async ensureAutonomousMode(userId: UUID): Promise<AutonomousBootstrapResult> {
    // Ensure portfolio / risk / watchlist rows exist before mutating them.
    this.platform.getRiskRules(userId);
    // Paper execution path: provision internal PAPER broker + demo cash when Alpaca is absent.
    const brokers = this.platform.listBrokerAccounts(userId);
    const hasAlpaca = brokers.some((account) => account.brokerName === "ALPACA" && account.hasCredentials);
    if (!hasAlpaca) {
      await this.platform.ensurePaperBrokerAccount(userId, { fundIfEmpty: true });
    }

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

    const fullPower = isDondieFullPower();
    const risk = this.platform.updateRiskRules(userId, {
      maxRiskPerTradePercent: fullPower ? 1.5 : 1,
      maxDailyLossPercent: fullPower ? 5 : 3,
      maxDrawdownPercent: fullPower ? 15 : 12,
      maxPositionSizePercent: fullPower ? 20 : 15,
      stopTrading: false
    });

    const symbols = [...DEFAULT_AUTONOMOUS_UNIVERSE];
    this.platform.updateWatchlist(userId, { symbols });

    const templateConfidence =
      typeof template.configuration.confidenceThreshold === "number"
        ? template.configuration.confidenceThreshold
        : 65;
    const minimumConfidence = fullPower
      ? Math.min(templateConfidence, dondieConfig.fullPowerMinConfidence)
      : templateConfidence;

    const strategy = this.ensureAgentManagedStrategy(userId, template.name, template.description, {
      ...template.configuration,
      templateId: template.id,
      confidenceThreshold: minimumConfidence,
      fullPower
    });

    const automation = this.platform.updateAutomationSettings(userId, {
      mode: "AUTOPILOT",
      emergencyStop: false,
      watchlist: symbols,
      marketHoursOnly: true,
      minimumConfidence,
      maxTradesPerDay: fullPower ? dondieConfig.fullPowerMaxTradesPerDay : 5,
      riskPerTradePercent: risk.maxRiskPerTradePercent,
      maxPositionSizePercent: risk.maxPositionSizePercent,
      dailyLossLimitPercent: risk.maxDailyLossPercent,
      maxDrawdownPercent: risk.maxDrawdownPercent,
      cooldownSeconds: fullPower ? 30 : 60,
      // Hands-off: do not ask for per-order confirmation
      requireConfirmationAboveValue: 1_000_000_000
    });

    let agent = await this.dondie.ensureActiveWithStrategy(userId, strategy.id);
    agent = await this.dondie.applyFullPowerSchedule(userId, agent);
    agent = await this.dondie.ensureFullPowerAiGrant(agent);
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
