import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { DondieBrainPlan, DondieTier, MarketTimeframe, Signal, UUID } from "@trading/types";
import { buildGoldAwarePrompt } from "@trading/shared";
import { dondieConfig } from "./dondie.config.js";

interface LlmDecision {
  readonly action: "EXECUTE" | "SKIP";
  readonly side?: "BUY" | "SELL";
  readonly reasoning: string;
  readonly confidence: number;
}

@Injectable()
export class DondieBrainLlmService {
  isConfigured(): boolean {
    return Boolean((process.env.DONDIE_LLM_API_KEY ?? dondieConfig.llmApiKey).trim());
  }

  async plan(
    tier: DondieTier,
    signal: Signal,
    symbol: string,
    timeframe: MarketTimeframe,
    userId: UUID
  ): Promise<DondieBrainPlan> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: "DONDIE_LLM_UNAVAILABLE",
        message: "Dondie LLM brain is not configured."
      });
    }

    const model = tier === "PRO" ? dondieConfig.llmProModel : dondieConfig.llmStandardModel;
    const prompt = buildGoldAwarePrompt(
      [
        "You are Dondie, an autonomous trading agent.",
        `Tier: ${tier}. Symbol: ${symbol}. Timeframe: ${timeframe}.`,
        `Baseline signal: ${signal.signalType} at ${signal.confidenceScore}% (${signal.modelVersion}).`,
        "Respond with JSON only: {\"action\":\"EXECUTE\"|\"SKIP\",\"side\":\"BUY\"|\"SELL\",\"reasoning\":\"...\",\"confidence\":0-100}."
      ].join(" "),
      symbol
    );

    const response = await fetch(`${dondieConfig.llmApiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DONDIE_LLM_API_KEY ?? dondieConfig.llmApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return concise trading decisions as JSON." },
          { role: "user", content: prompt }
        ],
        user: userId
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: "DONDIE_LLM_ERROR",
        message: `LLM request failed with status ${response.status}.`
      });
    }

    const payload = (await response.json()) as {
      readonly choices?: readonly { readonly message?: { readonly content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException({
        code: "DONDIE_LLM_ERROR",
        message: "LLM response was empty."
      });
    }

    const decision = JSON.parse(content) as LlmDecision;
    if (decision.action === "SKIP") {
      return {
        symbol,
        action: "SKIP",
        reasoning: decision.reasoning || `LLM brain skipped ${symbol}.`,
        confidence: Number(decision.confidence) || signal.confidenceScore
      };
    }

    return {
      symbol,
      action: "EXECUTE",
      side: decision.side ?? (signal.signalType === "SELL" ? "SELL" : "BUY"),
      reasoning: decision.reasoning || `LLM brain approved ${symbol}.`,
      confidence: Number(decision.confidence) || signal.confidenceScore
    };
  }
}
