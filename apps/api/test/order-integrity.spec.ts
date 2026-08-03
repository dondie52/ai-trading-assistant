import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PaperBrokerAdapter } from "../src/brokers/paper-broker.adapter.js";
import { AlpacaBrokerAdapter } from "../src/brokers/alpaca-broker.adapter.js";
import { BrokerCredentialService } from "../src/brokers/broker-credential.service.js";
import { PrismaAuditSink } from "../src/audit/prisma-audit.sink.js";
import { DatabaseHealthService } from "../src/infrastructure/database-health.service.js";
import { PrismaPlatformRepository } from "../src/infrastructure/prisma-platform.repository.js";
import { PrismaService } from "../src/infrastructure/prisma.service.js";
import { SupabaseCacheQueueService } from "../src/infrastructure/supabase-cache-queue.service.js";
import { PlatformService } from "../src/platform.service.js";
import { PlatformStore } from "../src/store/platform.store.js";
import { TokenService } from "../src/auth/token.service.js";
import { MfaService } from "../src/auth/mfa.service.js";
import { SessionActivityService } from "../src/auth/session-activity.service.js";
import { SupabaseAdminService } from "../src/auth/supabase-admin.service.js";
import { RealtimeEventBus } from "../src/realtime/realtime-event-bus.js";
import { OperationalMetricsService } from "../src/monitoring/operational-metrics.service.js";
import { OrderReconciliationService } from "../src/trading/order-reconciliation.service.js";
import { installAlpacaFetchMock, type AlpacaFetchMockOptions } from "./alpaca-fetch-mock.js";

const createPlatform = (): { readonly platform: PlatformService; readonly store: PlatformStore } => {
  const prisma = new PrismaService();
  const store = new PlatformStore();
  const repository = new PrismaPlatformRepository(prisma);
  const platform = new PlatformService(
    store,
    new TokenService(),
    new MfaService(),
    new PaperBrokerAdapter(),
    new AlpacaBrokerAdapter(),
    new BrokerCredentialService(),
    new SessionActivityService(store, repository),
    new DatabaseHealthService(prisma),
    new PrismaAuditSink(prisma),
    repository,
    new SupabaseCacheQueueService(prisma),
    new OperationalMetricsService(),
    new RealtimeEventBus(),
    new SupabaseAdminService()
  );
  return { platform, store };
};

const provisionUser = async (
  platform: PlatformService,
  store: PlatformStore
): Promise<{ readonly userId: string }> => {
  const admin = store.createUser({
    email: `admin-${randomUUID()}@example.com`,
    passwordHash: await hash("AdminPass123!", 10),
    firstName: "Ops",
    lastName: "Admin",
    role: "ADMIN"
  });
  store.ensureDefaultAccountState(admin.id);
  const email = `trader-${randomUUID()}@example.com`;
  await platform.createAdminUser(admin.id, {
    email,
    password: "ValidPass123!",
    firstName: "Auto",
    lastName: "Trader"
  });
  const login = await platform.login({ email, password: "ValidPass123!" });
  return { userId: login.user.id };
};

const connectAlpaca = async (platform: PlatformService, userId: string): Promise<void> => {
  await platform.connectBroker(userId, {
    brokerName: "ALPACA",
    accountId: "paper-account",
    apiKey: "validated-key",
    secret: "validated-secret",
    environment: "PAPER"
  });
};

/** An order the broker accepted but has not filled — the state that caused duplicate buys. */
const workingOrderMock = (): AlpacaFetchMockOptions => ({
  submitStatus: "accepted",
  orderSnapshot: { status: "accepted", filled_qty: "0", filled_avg_price: "" }
});

describe("order integrity", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousE2ESeed = process.env.ENABLE_E2E_SEED;
  const previousSimulated = process.env.ALLOW_SIMULATED_MARKET_DATA;

  beforeEach(() => {
    process.env.AUTH_PROVIDER = "legacy";
    delete process.env.ENABLE_E2E_SEED;
    delete process.env.ALLOW_SIMULATED_MARKET_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env.NODE_ENV = previousNodeEnv;
    if (previousE2ESeed === undefined) {
      delete process.env.ENABLE_E2E_SEED;
    } else {
      process.env.ENABLE_E2E_SEED = previousE2ESeed;
    }
    if (previousSimulated === undefined) {
      delete process.env.ALLOW_SIMULATED_MARKET_DATA;
    } else {
      process.env.ALLOW_SIMULATED_MARKET_DATA = previousSimulated;
    }
  });

  it("refuses to fabricate candles when the broker feed comes back empty", async () => {
    installAlpacaFetchMock({ bars: [] });
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    // Simulation is a test affordance; outside it, an empty feed must fail closed rather
    // than hand a random walk to signal generation while real orders go to the broker.
    process.env.NODE_ENV = "development";
    await expect(platform.listMarketData(userId, "AAPL", "1m")).rejects.toMatchObject({
      response: { code: "MARKET_DATA_UNAVAILABLE" }
    });
  });

  it("still simulates candles when simulation is explicitly enabled", async () => {
    installAlpacaFetchMock({ bars: [] });
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    process.env.NODE_ENV = "development";
    process.env.ALLOW_SIMULATED_MARKET_DATA = "true";
    const candles = await platform.listMarketData(userId, "AAPL", "1m");
    expect(candles.length).toBeGreaterThan(0);
  });

  it("never simulates candles in production, even with the opt-in set", async () => {
    installAlpacaFetchMock({ bars: [] });
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    process.env.NODE_ENV = "production";
    process.env.ALLOW_SIMULATED_MARKET_DATA = "true";
    await expect(platform.listMarketData(userId, "AAPL", "1m")).rejects.toMatchObject({
      response: { code: "MARKET_DATA_UNAVAILABLE" }
    });
  });

  it("blocks a second order while the first is still working at the broker", async () => {
    installAlpacaFetchMock(workingOrderMock());
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    const quote = await platform.getMarketQuote(userId, "AAPL", "1m");
    const first = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "AUTO",
      quantity: 1,
      price: quote.price,
      stopLoss: Number((quote.price * 0.95).toFixed(2)),
      takeProfit: Number((quote.price * 1.05).toFixed(2))
    });
    expect(first.order.status).toBe("SUBMITTED");
    expect(first.order.brokerOrderId).toBeTruthy();

    await expect(
      platform.createOrder(userId, {
        symbol: "AAPL",
        side: "BUY",
        orderType: "MARKET",
        mode: "AUTO",
        quantity: 1,
        price: quote.price,
        stopLoss: Number((quote.price * 0.95).toFixed(2)),
        takeProfit: Number((quote.price * 1.05).toFixed(2))
      })
    ).rejects.toMatchObject({
      response: { code: "DUPLICATE_OPEN_ORDER" }
    });

    const aaplOrders = platform.listOrders(userId).filter((order) => order.symbol === "AAPL");
    expect(aaplOrders).toHaveLength(1);
  });

  it("sends a client order id so a replayed submission cannot double-fill", async () => {
    const fetchMock = installAlpacaFetchMock();
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    const quote = await platform.getMarketQuote(userId, "AAPL", "1m");
    const execution = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "AUTO",
      quantity: 1,
      price: quote.price,
      stopLoss: Number((quote.price * 0.95).toFixed(2)),
      takeProfit: Number((quote.price * 1.05).toFixed(2))
    });

    const post = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/v2/orders") && call[1]?.method === "POST"
    );
    const body = JSON.parse(String(post?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body.client_order_id).toBe(execution.order.id);
  });

  it("reconciles a working order into a fill without any frontend involvement", async () => {
    installAlpacaFetchMock(workingOrderMock());
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    const quote = await platform.getMarketQuote(userId, "AAPL", "1m");
    const submitted = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "AUTO",
      quantity: 1,
      price: quote.price,
      stopLoss: Number((quote.price * 0.95).toFixed(2)),
      takeProfit: Number((quote.price * 1.05).toFixed(2))
    });
    expect(submitted.order.status).toBe("SUBMITTED");
    expect(platform.listTrades(userId)).toHaveLength(0);

    // The broker fills it later; only the reconciliation worker can notice.
    installAlpacaFetchMock({
      orderSnapshot: {
        id: submitted.order.brokerOrderId,
        status: "filled",
        filled_qty: "1",
        filled_avg_price: "186.2"
      }
    });

    const result = await platform.reconcileWorkingOrders(userId);
    expect(result.updated).toBe(1);

    const reconciled = platform.listOrders(userId).find((order) => order.id === submitted.order.id);
    expect(reconciled?.status).toBe("FILLED");
    expect(reconciled?.filledAveragePrice).toBe(186.2);
    expect(platform.listTrades(userId)).toHaveLength(1);
  });

  it("does not record a second trade when reconciliation runs twice", async () => {
    installAlpacaFetchMock(workingOrderMock());
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    const quote = await platform.getMarketQuote(userId, "AAPL", "1m");
    const submitted = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "AUTO",
      quantity: 1,
      price: quote.price,
      stopLoss: Number((quote.price * 0.95).toFixed(2)),
      takeProfit: Number((quote.price * 1.05).toFixed(2))
    });

    installAlpacaFetchMock({
      orderSnapshot: {
        id: submitted.order.brokerOrderId,
        status: "filled",
        filled_qty: "1",
        filled_avg_price: "186.2"
      }
    });
    await platform.reconcileWorkingOrders(userId);
    await platform.reconcileWorkingOrders(userId);

    expect(platform.listTrades(userId)).toHaveLength(1);
  });

  it("clears an order the broker has never heard of once it goes stale", async () => {
    installAlpacaFetchMock(workingOrderMock());
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    const quote = await platform.getMarketQuote(userId, "AAPL", "1m");
    const submitted = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "AUTO",
      quantity: 1,
      price: quote.price,
      stopLoss: Number((quote.price * 0.95).toFixed(2)),
      takeProfit: Number((quote.price * 1.05).toFixed(2))
    });

    // Backdate past the stale window and make the broker deny all knowledge of it.
    const stored = store.orders.get(submitted.order.id);
    if (!stored) {
      throw new Error("expected the submitted order to be stored");
    }
    store.orders.set(stored.id, {
      ...stored,
      submittedAt: new Date(Date.now() - 120 * 60_000).toISOString()
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/v2/orders/")) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      })
    );

    const result = await platform.reconcileWorkingOrders(userId);
    expect(result.abandoned).toBe(1);
    expect(platform.listOrders(userId).find((order) => order.id === stored.id)?.status).toBe("CANCELLED");
  });

  it("reports realized P&L from broker fills rather than local trade rows", async () => {
    installAlpacaFetchMock({
      fills: [
        {
          id: "fill-1",
          symbol: "SPY",
          side: "buy",
          qty: "2",
          price: "100",
          transaction_time: "2026-01-02T15:00:00.000Z"
        },
        {
          id: "fill-2",
          symbol: "SPY",
          side: "sell",
          qty: "2",
          price: "104",
          transaction_time: "2026-01-03T15:00:00.000Z"
        }
      ]
    });
    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    expect(store.realizedLedger.get(userId)?.total).toBe(8);
    expect(platform.listPortfolios(userId)[0]?.realizedPnl).toBe(8);
  });

  it("keeps a filled order filled when the follow-up broker sync fails", async () => {
    let ordersPosted = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const target = String(url);
        if (target.includes("/v2/orders") && init?.method === "POST") {
          ordersPosted += 1;
          return {
            ok: true,
            json: async () => ({
              id: randomUUID(),
              status: "filled",
              filled_qty: "1",
              filled_avg_price: "185.6"
            })
          };
        }
        if (target.includes("/v2/account/activities")) {
          return { ok: true, json: async () => [] };
        }
        if (target.includes("/v2/positions")) {
          // Broker state goes unavailable immediately after the fill.
          return ordersPosted === 0
            ? { ok: true, json: async () => [] }
            : { ok: false, status: 503, json: async () => ({}) };
        }
        if (target.includes("/v2/account")) {
          return {
            ok: true,
            json: async () => ({
              id: "acct-1",
              account_number: "PA123",
              cash: "100000",
              equity: "100000",
              buying_power: "100000",
              portfolio_value: "100000",
              last_equity: "100000"
            })
          };
        }
        if (target.includes("/bars")) {
          return {
            ok: true,
            json: async () => ({
              bars: Array.from({ length: 80 }, (_, index) => ({
                t: new Date(Date.now() - (80 - index) * 60_000).toISOString(),
                o: 180 + index * 0.05,
                h: 181 + index * 0.05,
                l: 179 + index * 0.05,
                c: 180 + index * 0.05,
                v: 1_000 + index
              }))
            })
          };
        }
        if (target.includes("/quotes/latest")) {
          return { ok: true, json: async () => ({ quote: { bp: 185.5, ap: 185.7, t: new Date().toISOString() } }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      })
    );
    process.env.ALPACA_API_KEY = "test-key";
    process.env.ALPACA_SECRET_KEY = "test-secret";
    process.env.ALPACA_ENVIRONMENT = "PAPER";

    const { platform, store } = createPlatform();
    const { userId } = await provisionUser(platform, store);
    await connectAlpaca(platform, userId);

    const quote = await platform.getMarketQuote(userId, "AAPL", "1m");
    const execution = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "AUTO",
      quantity: 1,
      price: quote.price,
      stopLoss: Number((quote.price * 0.95).toFixed(2)),
      takeProfit: Number((quote.price * 1.05).toFixed(2))
    });

    // A failed post-fill sync must not be reported as a rejected order: the money moved.
    expect(execution.order.status).toBe("FILLED");
    expect(platform.listTrades(userId)).toHaveLength(1);
  });
});

describe("reconciliation worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("only visits users that actually hold a working order", async () => {
    const store = new PlatformStore();
    const platform = {
      reconcileWorkingOrders: vi.fn().mockResolvedValue({
        checked: 1,
        updated: 1,
        abandoned: 0,
        errors: []
      })
    } as unknown as PlatformService;
    const worker = new OrderReconciliationService(platform, store);

    const workingUser = randomUUID();
    const settledUser = randomUUID();
    const baseOrder = {
      brokerAccountId: randomUUID(),
      symbol: "SPY",
      side: "BUY" as const,
      orderType: "MARKET" as const,
      mode: "AUTO" as const,
      quantity: 1,
      price: 100,
      stopLoss: 95,
      takeProfit: 110,
      submittedAt: new Date().toISOString(),
      riskDecision: {
        approved: true,
        reasons: [],
        maxRiskAmount: 10,
        proposedRiskAmount: 5,
        proposedPositionValue: 100,
        calculatedQuantity: 1
      }
    };
    store.orders.set("order-working", {
      ...baseOrder,
      id: "order-working",
      userId: workingUser,
      status: "SUBMITTED"
    });
    store.orders.set("order-filled", {
      ...baseOrder,
      id: "order-filled",
      userId: settledUser,
      status: "FILLED"
    });

    const result = await worker.reconcileAll();

    expect(platform.reconcileWorkingOrders).toHaveBeenCalledTimes(1);
    expect(platform.reconcileWorkingOrders).toHaveBeenCalledWith(workingUser);
    expect(result.updated).toBe(1);
  });

  it("reports no work when nothing is outstanding", async () => {
    const store = new PlatformStore();
    const platform = { reconcileWorkingOrders: vi.fn() } as unknown as PlatformService;
    const worker = new OrderReconciliationService(platform, store);

    const result = await worker.reconcileAll();

    expect(platform.reconcileWorkingOrders).not.toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 0, updated: 0, abandoned: 0 });
  });
});
