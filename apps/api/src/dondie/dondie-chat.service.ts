import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  DondieAgent,
  DondieChatMessage,
  DondieChatReply,
  DondieChatThread,
  DondieMemory,
  JsonObject,
  Strategy,
  UUID
} from "@trading/types";
import { PlatformStore } from "../store/platform.store.js";
import { dondieConfig } from "./dondie.config.js";
import { DondieMemoryService } from "./dondie-memory.service.js";
import { DondieWeekendEarnService } from "./dondie-weekend-earn.service.js";

const CHAT_THREAD_LIMIT = 20;
const MAX_MESSAGE_CHARS = 500;

export type DondieChatContext = {
  readonly agentStatus: DondieAgent["status"] | "INACTIVE";
  readonly tier: DondieAgent["tier"] | "FREE";
  readonly walletBalance: number;
  readonly weekendMode: boolean;
  readonly brain: string;
  readonly task: string;
  readonly strategyName: string;
  readonly strategySummary: string;
  readonly symbols: readonly string[];
  readonly recentMemories: readonly string[];
};

const isoNow = (): string => new Date().toISOString();

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Request body must be an object." });
  }
  return value as Record<string, unknown>;
};

const strategyTemplateLabel = (configuration: JsonObject | undefined): string => {
  const template = configuration?.template;
  return typeof template === "string" && template.trim() ? template.trim() : "Agent-managed equity";
};

export const buildDondieChatContext = (input: {
  readonly agent: DondieAgent | null | undefined;
  readonly strategy: Strategy | null | undefined;
  readonly memories: readonly DondieMemory[];
  readonly weekendMode: boolean;
}): DondieChatContext => {
  const agent = input.agent ?? null;
  const strategy = input.strategy ?? null;
  const weekendMode = input.weekendMode;
  const symbols = weekendMode
    ? [dondieConfig.weekendEarnSymbol]
    : (agent?.symbolUniverse?.length ? agent.symbolUniverse : ["(none yet)"]);

  if (weekendMode) {
    return {
      agentStatus: agent?.status ?? "INACTIVE",
      tier: agent?.tier ?? "FREE",
      walletBalance: agent?.walletBalance ?? 0,
      weekendMode: true,
      brain: dondieConfig.weekendEarnBrain,
      task: `Paper-trading ${dondieConfig.weekendEarnSymbol} while US equities sleep`,
      strategyName: "Weekend crypto desk",
      strategySummary:
        `Paper ${dondieConfig.weekendEarnSymbol} micro-scalps (BUY/SELL from a desk salt), ~85% cash notional, ` +
        `immediate close with a small move; green PnL shares credit the survival wallet up to $${dondieConfig.weekendEarnMaxPerDayUsd}/day. Not a live crypto venue.`,
      symbols,
      recentMemories: input.memories.slice(0, 5).map((memory) => memory.summary)
    };
  }

  const strategyName = strategy?.name ?? "No strategy linked";
  const strategySummary = strategy
    ? `${strategyTemplateLabel(strategy.configuration)} — ${strategy.description || "Agent picks setups from the equity universe."}`
    : "Activate hands-off so I can pick an equity strategy when the market opens.";

  return {
    agentStatus: agent?.status ?? "INACTIVE",
    tier: agent?.tier ?? "FREE",
    walletBalance: agent?.walletBalance ?? 0,
    weekendMode: false,
    brain: agent?.tier === "PRO" ? "pro" : agent?.tier === "STANDARD" ? "standard" : "free",
    task:
      agent?.status === "ACTIVE"
        ? `Scanning equity universe for setups (${symbols.slice(0, 4).join(", ")}${symbols.length > 4 ? "…" : ""})`
        : agent?.status === "PAUSED"
          ? "Paused — waiting for you to resume"
          : "Idle — start hands-off to put me to work",
    strategyName,
    strategySummary,
    symbols,
    recentMemories: input.memories.slice(0, 5).map((memory) => memory.summary)
  };
};

const asksAboutStrategy = (message: string): boolean =>
  /\b(strateg(y|ies)|brain|how (do|are) you trad|what.*(rules|setup|edge)|scalp|indicators?)\b/i.test(
    message
  );

const asksAboutWork = (message: string): boolean =>
  /\b(what.*(work|doing|up to|on)|working on|current task|status|busy|gig|hustle)\b/i.test(message);

export const speechBubbleFromReply = (reply: string): string => {
  const cleaned = reply.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "YO";
  }
  const first = cleaned.split(/[.!?]/u)[0]?.trim() ?? cleaned;
  const words = first.split(" ").filter(Boolean).slice(0, 3).join(" ");
  return words.slice(0, 18).toUpperCase();
};

export const templateChatReply = (message: string, context: DondieChatContext): string => {
  if (asksAboutStrategy(message)) {
    if (context.weekendMode) {
      return (
        `Right now I'm on the ${context.brain} brain — ${context.strategySummary} ` +
        `Weekdays I switch back to my agent-managed equity book.`
      );
    }
    return (
      `I'm running ${context.strategyName} via the ${context.brain} brain. ${context.strategySummary} ` +
      `Universe: ${context.symbols.slice(0, 6).join(", ")}.`
    );
  }

  if (asksAboutWork(message) || message.length < 24) {
    if (context.agentStatus === "INACTIVE") {
      return "I'm not activated yet. Hit Start hands-off and I'll pick a strategy and get to work.";
    }
    if (context.weekendMode) {
      return (
        `I'm ${context.agentStatus === "ACTIVE" ? "on the weekend crypto desk" : context.agentStatus.toLowerCase()} — ` +
        `${context.task}. Brain: ${context.brain}. Ask me about the strategy if you want the rules.`
      );
    }
    return (
      `Status ${context.agentStatus}. ${context.task}. ` +
      `Strategy: ${context.strategyName} (${context.brain} brain). Wallet $${context.walletBalance.toFixed(2)}.`
    );
  }

  const memoryHint =
    context.recentMemories[0] !== undefined
      ? ` Latest note: ${context.recentMemories[0]}`
      : "";

  return (
    `Got it. I'm ${context.agentStatus === "ACTIVE" ? "working" : context.agentStatus.toLowerCase()} — ` +
    `${context.task}. Strategy: ${context.strategyName}.${memoryHint}`
  );
};

const emptyThread = (userId: UUID): DondieChatThread => ({
  userId,
  messages: [],
  updatedAt: isoNow()
});

@Injectable()
export class DondieChatService {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(DondieMemoryService) private readonly memory: DondieMemoryService,
    @Inject(DondieWeekendEarnService) private readonly weekendEarn: DondieWeekendEarnService
  ) {}

  getThread(userId: UUID): DondieChatThread {
    return this.store.dondieChatThreads.get(userId) ?? emptyThread(userId);
  }

  buildContext(userId: UUID): DondieChatContext {
    const agent = [...this.store.dondieAgents.values()].find((entry) => entry.userId === userId) ?? null;
    const strategy =
      agent?.strategyId !== undefined ? (this.store.strategies.get(agent.strategyId) ?? null) : null;
    const memories = agent ? this.memory.listMemories(agent.id) : [];
    return buildDondieChatContext({
      agent,
      strategy,
      memories,
      weekendMode: this.weekendEarn.isWeekendEarnWindow()
    });
  }

  async chat(userId: UUID, bodyValue: unknown): Promise<DondieChatReply> {
    const body = asRecord(bodyValue);
    const raw = body.message;
    if (typeof raw !== "string" || !raw.trim()) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "message is required." });
    }
    const content = raw.trim().slice(0, MAX_MESSAGE_CHARS);
    const now = isoNow();
    const userMessage: DondieChatMessage = {
      id: randomUUID(),
      role: "user",
      content,
      createdAt: now
    };

    const context = this.buildContext(userId);
    let replyText: string;
    let source: DondieChatReply["source"] = "template";

    if (this.isLlmConfigured()) {
      try {
        replyText = await this.llmReply(content, context, this.getThread(userId).messages);
        source = "llm";
      } catch {
        replyText = templateChatReply(content, context);
        source = "template";
      }
    } else {
      replyText = templateChatReply(content, context);
    }

    const assistantMessage: DondieChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: replyText,
      createdAt: isoNow()
    };

    const previous = this.getThread(userId).messages;
    const messages = [...previous, userMessage, assistantMessage].slice(-CHAT_THREAD_LIMIT);
    const thread: DondieChatThread = {
      userId,
      messages,
      updatedAt: assistantMessage.createdAt
    };
    this.store.dondieChatThreads.set(userId, thread);

    return {
      message: assistantMessage,
      thread,
      speechBubble: speechBubbleFromReply(replyText),
      source
    };
  }

  private isLlmConfigured(): boolean {
    return Boolean((process.env.DONDIE_LLM_API_KEY ?? dondieConfig.llmApiKey).trim());
  }

  private async llmReply(
    userMessage: string,
    context: DondieChatContext,
    history: readonly DondieChatMessage[]
  ): Promise<string> {
    const system = [
      "You are Dondie, an autonomous trading agent speaking to your human operator in the Agent Office.",
      "Stay in character: concise, operational, first person. No markdown fences.",
      "Answer from the live context below. Do not invent live fills or broker balances.",
      `Status: ${context.agentStatus}. Tier: ${context.tier}. Wallet: $${context.walletBalance.toFixed(2)}.`,
      `Weekend mode: ${context.weekendMode}. Brain: ${context.brain}.`,
      `Current task: ${context.task}.`,
      `Strategy: ${context.strategyName}. ${context.strategySummary}`,
      `Symbols: ${context.symbols.join(", ")}.`,
      context.recentMemories.length > 0
        ? `Recent memories: ${context.recentMemories.join(" | ")}`
        : "No recent memories."
    ].join(" ");

    const historyMessages = history.slice(-8).map((entry) => ({
      role: entry.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: entry.content
    }));

    const response = await fetch(`${dondieConfig.llmApiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DONDIE_LLM_API_KEY ?? dondieConfig.llmApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: dondieConfig.llmStandardModel,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          ...historyMessages,
          { role: "user", content: userMessage }
        ]
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
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ServiceUnavailableException({
        code: "DONDIE_LLM_ERROR",
        message: "LLM response was empty."
      });
    }
    return content.slice(0, 800);
  }
}
