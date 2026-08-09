import { Inject, Injectable } from "@nestjs/common";
import type { DondieBrainPlan, MarketTimeframe, Signal, UUID } from "@trading/types";
import { isGoldSymbol } from "@trading/shared";
import { PlatformService } from "../platform.service.js";
import { logSignal } from "../trading/execution-log.js";

const goldSuffix = (symbol: string): string =>
  isGoldSymbol(symbol)
    ? " Gold-aware tuning applied (trend-weighted, ATR-adjusted, seasonally tilted confidence)."
    : "";

export interface DondieFreeBrainResult {
  readonly plan: DondieBrainPlan;
  readonly signal: Signal;
}

@Injectable()
export class DondieBrainFreeService {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  async plan(
    userId: UUID,
    strategyId: UUID,
    symbol: string,
    timeframe: MarketTimeframe = "1h"
  ): Promise<DondieFreeBrainResult> {
    const signal = await this.platform.generateTradingSignal(userId, { strategyId, symbol, timeframe });
    logSignal({
      symbol: signal.symbol,
      action: signal.signalType,
      confidence: signal.confidenceScore
    });

    if (signal.signalType === "HOLD") {
      return {
        signal,
        plan: {
          symbol,
          action: "SKIP",
          reasoning: `Free brain sees HOLD on ${symbol} (confidence ${signal.confidenceScore}%).${goldSuffix(symbol)}`,
          confidence: signal.confidenceScore
        }
      };
    }

    return {
      signal,
      plan: {
        symbol,
        action: "EXECUTE",
        side: signal.signalType,
        reasoning: `Free brain signals ${signal.signalType} on ${symbol} with ${signal.confidenceScore}% confidence using ${signal.modelVersion}.${goldSuffix(symbol)}`,
        confidence: signal.confidenceScore
      }
    };
  }
}
