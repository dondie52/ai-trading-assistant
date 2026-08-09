import { afterEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "@trading/types";
import { DondieBrainLlmService } from "../src/dondie/dondie-brain-llm.service.js";

const sampleSignal = (): Signal => ({
  id: "signal-1",
  userId: "user-1",
  strategyId: "strategy-1",
  symbol: "AAPL",
  signalType: "BUY",
  confidenceScore: 72,
  modelVersion: "mvp-baseline-1.0.0",
  features: {},
  generatedAt: new Date().toISOString()
});

describe("Dondie phase 3 LLM brain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DONDIE_LLM_API_KEY;
  });

  it("returns an execute plan from the LLM response", async () => {
    process.env.DONDIE_LLM_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "EXECUTE",
                  side: "BUY",
                  reasoning: "Momentum supports a long entry.",
                  confidence: 81
                })
              }
            }
          ]
        })
      })
    );

    const brain = new DondieBrainLlmService();
    const plan = await brain.plan("STANDARD", sampleSignal(), "AAPL", "1h", "user-1");
    expect(plan.action).toBe("EXECUTE");
    expect(plan.side).toBe("BUY");
    expect(plan.reasoning).toContain("Momentum");
  });

  it("primes the prompt with gold-specific context for gold symbols", async () => {
    process.env.DONDIE_LLM_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: "EXECUTE",
                side: "BUY",
                reasoning: "Dollar weakness supports gold.",
                confidence: 74
              })
            }
          }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const brain = new DondieBrainLlmService();
    const signal = { ...sampleSignal(), symbol: "GLD" };
    await brain.plan("STANDARD", signal, "GLD", "1h", "user-1");

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userMessage = requestBody.messages.find((message: { role: string }) => message.role === "user");
    expect(userMessage.content).toContain("safe-haven");
    expect(userMessage.content).toContain("DXY");
  });
});
