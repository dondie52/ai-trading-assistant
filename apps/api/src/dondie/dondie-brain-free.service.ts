import { Inject, Injectable } from "@nestjs/common";
import type { DondieBrainPlan, MarketTimeframe, UUID } from "@trading/types";
import { PlatformService } from "../platform.service.js";

@Injectable()
export class DondieBrainFreeService {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  async plan(
    userId: UUID,
    strategyId: UUID,
    symbol: string,
    timeframe: MarketTimeframe = "1h"
  ): Promise<DondieBrainPlan> {
    const signal = await this.platform.generateTradingSignal(userId, { strategyId, symbol, timeframe });
    if (signal.signalType === "HOLD") {
      return {
        symbol,
        action: "SKIP",
        reasoning: `Free brain sees HOLD on ${symbol} (confidence ${signal.confidenceScore}%).`,
        confidence: signal.confidenceScore
      };
    }
    return {
      symbol,
      action: "EXECUTE",
      side: signal.signalType,
      reasoning: `Free brain signals ${signal.signalType} on ${symbol} with ${signal.confidenceScore}% confidence using ${signal.modelVersion}.`,
      confidence: signal.confidenceScore
    };
  }
}
