import { Inject, Injectable } from "@nestjs/common";
import type { DondieAgent, DondieBrainPlan, MarketTimeframe, UUID } from "@trading/types";
import { PlatformService } from "../platform.service.js";
import { DondieBrainFreeService } from "./dondie-brain-free.service.js";
import { DondieBrainLlmService } from "./dondie-brain-llm.service.js";

export interface DondieBrainRunPlan {
  readonly brain: "free" | "standard" | "pro";
  readonly plan: DondieBrainPlan;
}

@Injectable()
export class DondieBrainService {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(DondieBrainFreeService) private readonly freeBrain: DondieBrainFreeService,
    @Inject(DondieBrainLlmService) private readonly llmBrain: DondieBrainLlmService
  ) {}

  async plan(
    userId: UUID,
    agent: DondieAgent,
    strategyId: UUID,
    symbol: string,
    timeframe: MarketTimeframe
  ): Promise<DondieBrainRunPlan> {
    if (agent.tier === "FREE" || !this.llmBrain.isConfigured()) {
      const plan = await this.freeBrain.plan(userId, strategyId, symbol, timeframe);
      return { brain: "free", plan };
    }

    const signal = await this.platform.generateTradingSignal(userId, { strategyId, symbol, timeframe });
    const plan = await this.llmBrain.plan(agent.tier, signal, symbol, timeframe, userId);
    return {
      brain: agent.tier === "PRO" ? "pro" : "standard",
      plan
    };
  }
}
