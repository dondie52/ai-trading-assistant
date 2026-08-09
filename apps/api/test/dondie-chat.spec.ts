import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { DondieAgent, Strategy } from "@trading/types";
import { PlatformStore } from "../src/store/platform.store.js";
import { PrismaService } from "../src/infrastructure/prisma.service.js";
import { DondieRepository } from "../src/dondie/dondie.repository.js";
import { DondieMemoryService } from "../src/dondie/dondie-memory.service.js";
import { DondieWeekendEarnService } from "../src/dondie/dondie-weekend-earn.service.js";
import { DondieWalletService } from "../src/dondie/dondie-wallet.service.js";
import {
  buildDondieChatContext,
  DondieChatService,
  speechBubbleFromReply,
  templateChatReply
} from "../src/dondie/dondie-chat.service.js";
import { dondieConfig } from "../src/dondie/dondie.config.js";

const saturday = new Date("2026-07-25T15:00:00.000Z");
const wednesday = new Date("2026-07-22T15:00:00.000Z");

const makeAgent = (overrides: Partial<DondieAgent> = {}): DondieAgent => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    userId: randomUUID(),
    name: "Dondie",
    tier: "FREE",
    status: "ACTIVE",
    walletBalance: 1.25,
    strategyId: randomUUID(),
    scheduleMinutes: 60,
    symbolUniverse: ["AAPL", "MSFT", "SPY"],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
};

const makeStrategy = (id: string, userId: string): Strategy => {
  const now = new Date().toISOString();
  return {
    id,
    userId,
    name: "Agent Managed — Momentum",
    description: "Momentum defaults for mid-size accounts.",
    version: "1",
    status: "ACTIVE",
    configuration: {
      agentManaged: true,
      template: "Momentum",
      indicators: ["EMA", "RSI", "MACD"]
    },
    createdAt: now,
    updatedAt: now
  };
};

describe("Dondie chat context + templates", () => {
  it("describes weekend-crypto-desk when US equities are closed", () => {
    const agent = makeAgent();
    const context = buildDondieChatContext({
      agent,
      strategy: makeStrategy(agent.strategyId!, agent.userId),
      memories: [
        {
          id: randomUUID(),
          agentId: agent.id,
          summary: "weekend crypto desk on BTCUSD: Paper BTCUSD BUY: closed green",
          evaluation: { weekendGig: true },
          createdAt: new Date().toISOString()
        }
      ],
      weekendMode: true
    });

    expect(context.brain).toBe(dondieConfig.weekendEarnBrain);
    expect(context.symbols).toEqual(["BTCUSD"]);
    expect(context.task).toMatch(/BTCUSD/i);

    const work = templateChatReply("What are you working on?", context);
    expect(work).toMatch(/weekend crypto desk/i);
    expect(work).toMatch(/weekend-crypto-desk/i);

    const strategy = templateChatReply("What's your strategy?", context);
    expect(strategy).toMatch(/BTCUSD/i);
    expect(strategy).toMatch(/paper/i);
    expect(strategy).toMatch(/\$2\.5\/day|2\.5\/day/i);
  });

  it("describes agent-managed equity strategy on weekdays", () => {
    const agent = makeAgent();
    const strategy = makeStrategy(agent.strategyId!, agent.userId);
    const context = buildDondieChatContext({
      agent,
      strategy,
      memories: [],
      weekendMode: false
    });

    expect(context.brain).toBe("free");
    expect(context.strategyName).toBe("Agent Managed — Momentum");
    expect(context.symbols).toContain("AAPL");

    const work = templateChatReply("What are you working on?", context);
    expect(work).toMatch(/Scanning equity universe/i);
    expect(work).toMatch(/Momentum/i);

    const strategyReply = templateChatReply("Tell me about your trading strategy", context);
    expect(strategyReply).toMatch(/Momentum/i);
    expect(strategyReply).toMatch(/free brain/i);
  });

  it("builds a short speech bubble from a reply", () => {
    expect(speechBubbleFromReply("I'm on the weekend crypto desk.")).toMatch(/I'M ON THE/i);
  });
});

describe("DondieChatService", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DONDIE_LLM_API_KEY;
    delete process.env.DONDIE_WEEKEND_EARN_ENABLED;
    delete process.env.DONDIE_NFP_ONLY;
  });

  const createChat = (): {
    readonly chat: DondieChatService;
    readonly store: PlatformStore;
    readonly userId: string;
  } => {
    process.env.DONDIE_SCHEDULER_ENABLED = "false";
    // Weekend-earn mode never overlaps the NFP-only window (see dondie-weekend-earn.service.ts),
    // so this suite's weekend-mode assertions need NFP-only mode off.
    process.env.DONDIE_NFP_ONLY = "false";
    delete process.env.DONDIE_LLM_API_KEY;
    const store = new PlatformStore();
    const prisma = new PrismaService();
    const repository = new DondieRepository(prisma);
    const wallet = new DondieWalletService(store, repository);
    const memory = new DondieMemoryService(store, repository);
    const weekendEarn = new DondieWeekendEarnService(wallet, store);
    const chat = new DondieChatService(store, memory, weekendEarn);
    const user = store.createUser({
      email: `chat-${randomUUID()}@example.com`,
      firstName: "Op",
      lastName: "Erator",
      role: "TRADER"
    });
    return { chat, store, userId: user.id };
  };

  it("persists a weekend template thread via POST chat", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(saturday);
    const { chat, store, userId } = createChat();
    const strategyId = randomUUID();
    const agent = makeAgent({ userId, strategyId });
    store.strategies.set(strategyId, makeStrategy(strategyId, userId));
    store.dondieAgents.set(agent.id, agent);

    const reply = await chat.chat(userId, { message: "What are you working on?" });
    expect(reply.source).toBe("template");
    expect(reply.message.role).toBe("assistant");
    expect(reply.message.content).toMatch(/weekend crypto desk|BTCUSD/i);
    expect(reply.speechBubble.length).toBeGreaterThan(0);
    expect(reply.thread.messages).toHaveLength(2);

    const loaded = chat.getThread(userId);
    expect(loaded.messages).toHaveLength(2);
    expect(loaded.messages[0]?.role).toBe("user");
  });

  it("answers strategy questions with equity template on weekdays", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(wednesday);
    const { chat, store, userId } = createChat();
    const strategyId = randomUUID();
    const agent = makeAgent({ userId, strategyId, tier: "STANDARD" });
    store.strategies.set(strategyId, makeStrategy(strategyId, userId));
    store.dondieAgents.set(agent.id, agent);

    const reply = await chat.chat(userId, { message: "What's your strategy?" });
    expect(reply.source).toBe("template");
    expect(reply.message.content).toMatch(/Agent Managed — Momentum/i);
    expect(reply.message.content).toMatch(/standard brain/i);
  });

  it("rejects empty messages", async () => {
    const { chat, userId } = createChat();
    await expect(chat.chat(userId, { message: "   " })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "VALIDATION_ERROR" })
    });
  });
});
