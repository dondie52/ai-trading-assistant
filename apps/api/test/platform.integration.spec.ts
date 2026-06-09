import { afterEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
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
import { RealtimeEventBus } from "../src/realtime/realtime-event-bus.js";
import { OperationalMetricsService } from "../src/monitoring/operational-metrics.service.js";
import { installAlpacaFetchMock } from "./alpaca-fetch-mock.js";

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
    new RealtimeEventBus()
  );
  return { platform, store };
};

const fundPaperPortfolio = (store: PlatformStore, userId: string, amount: number): void => {
  const portfolio = [...store.portfolios.values()].find((candidate) => candidate.userId === userId);
  if (!portfolio) {
    return;
  }
  store.portfolios.set(portfolio.id, {
    ...portfolio,
    cashBalance: amount,
    portfolioValue: amount
  });
};

const registerAndLogin = async (
  platform: PlatformService,
  store: PlatformStore,
  options: { readonly fundPaper?: number } = {}
): Promise<{ readonly userId: string }> => {
  const email = `integration-${randomUUID()}@example.com`;
  await platform.register({
    email,
    password: "ValidPass123!",
    firstName: "Integration",
    lastName: "Trader"
  });
  const login = await platform.login({ email, password: "ValidPass123!" });
  if (options.fundPaper !== undefined) {
    fundPaperPortfolio(store, login.user.id, options.fundPaper);
  }
  return { userId: login.user.id };
};

describe("platform integration", () => {
  const previousExposeResetToken = process.env.EXPOSE_PASSWORD_RESET_TOKEN_FOR_TESTS;
  const previousEnableE2ESeed = process.env.ENABLE_E2E_SEED;
  const previousE2EAdminEmail = process.env.E2E_ADMIN_EMAIL;
  const previousE2EAdminPassword = process.env.E2E_ADMIN_PASSWORD;

  beforeEach(() => {
    installAlpacaFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (previousExposeResetToken === undefined) {
      delete process.env.EXPOSE_PASSWORD_RESET_TOKEN_FOR_TESTS;
    } else {
      process.env.EXPOSE_PASSWORD_RESET_TOKEN_FOR_TESTS = previousExposeResetToken;
    }
    if (previousEnableE2ESeed === undefined) {
      delete process.env.ENABLE_E2E_SEED;
    } else {
      process.env.ENABLE_E2E_SEED = previousEnableE2ESeed;
    }
    if (previousE2EAdminEmail === undefined) {
      delete process.env.E2E_ADMIN_EMAIL;
    } else {
      process.env.E2E_ADMIN_EMAIL = previousE2EAdminEmail;
    }
    if (previousE2EAdminPassword === undefined) {
      delete process.env.E2E_ADMIN_PASSWORD;
    } else {
      process.env.E2E_ADMIN_PASSWORD = previousE2EAdminPassword;
    }
  });

  it("registers, logs in, refreshes, and provisions a portfolio", async () => {
    const { platform } = createPlatform();
    const email = `auth-${randomUUID()}@example.com`;

    const registered = await platform.register({
      email,
      password: "ValidPass123!",
      firstName: "Ada",
      lastName: "Quant"
    });
    const login = await platform.login({ email, password: "ValidPass123!" });
    const refreshed = await platform.refresh({ refreshToken: login.refreshToken });
    const portfolios = platform.listPortfolios(login.user.id);

    expect(registered.user.email).toBe(email);
    expect(refreshed.accessToken.length).toBeGreaterThan(20);
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    await expect(platform.refresh({ refreshToken: login.refreshToken })).rejects.toMatchObject({
      response: { code: "INVALID_SESSION" }
    });
    await expect(platform.refresh({ refreshToken: refreshed.refreshToken })).resolves.toMatchObject({
      user: { email }
    });
    expect(portfolios[0]?.cashBalance).toBe(0);
  });

  it("resets passwords with hashed tokens and revokes active sessions", async () => {
    process.env.EXPOSE_PASSWORD_RESET_TOKEN_FOR_TESTS = "true";
    const { platform } = createPlatform();
    const email = `reset-${randomUUID()}@example.com`;
    await platform.register({
      email,
      password: "ValidPass123!",
      firstName: "Reset",
      lastName: "Trader"
    });
    const login = await platform.login({ email, password: "ValidPass123!" });
    const request = await platform.requestPasswordReset({ email });

    expect(request.delivery).toBe("development_response");
    expect(request.resetToken).toBeTruthy();

    const confirmation = await platform.confirmPasswordReset({
      resetToken: request.resetToken,
      password: "NewValidPass123!"
    });
    const auditJson = JSON.stringify(platform.listAuditLogs());

    expect(confirmation.sessionsRevoked).toBe(1);
    await expect(platform.refresh({ refreshToken: login.refreshToken })).rejects.toThrow();
    await expect(platform.login({ email, password: "ValidPass123!" })).rejects.toMatchObject({
      response: { code: "INVALID_CREDENTIALS" }
    });
    await expect(platform.login({ email, password: "NewValidPass123!" })).resolves.toMatchObject({
      user: { email }
    });
    expect(auditJson).toContain("AUTH_PASSWORD_RESET_REQUESTED");
    expect(auditJson).toContain("AUTH_PASSWORD_RESET_CONFIRMED");
    expect(auditJson).not.toContain(request.resetToken);
  });

  it("enforces TOTP MFA before issuing a login session", async () => {
    const { platform } = createPlatform();
    const email = `mfa-${randomUUID()}@example.com`;
    await platform.register({
      email,
      password: "ValidPass123!",
      firstName: "MFA",
      lastName: "Trader"
    });
    const initialLogin = await platform.login({ email, password: "ValidPass123!" });
    const tokenPayload = JSON.parse(
      Buffer.from(initialLogin.accessToken.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as { readonly sessionId: string };
    const setup = await platform.setupMfa(initialLogin.user.id);
    const code = new MfaService().generateCode(setup.secret);

    const enabled = await platform.enableMfa(initialLogin.user.id, tokenPayload.sessionId, { code });

    expect(enabled.mfaEnabled).toBe(true);
    await expect(platform.login({ email, password: "ValidPass123!" })).rejects.toMatchObject({
      response: { code: "MFA_REQUIRED" }
    });
    await expect(
      platform.login({ email, password: "ValidPass123!", mfaCode: "000000" })
    ).rejects.toMatchObject({
      response: { code: "INVALID_MFA_CODE" }
    });
    await expect(platform.login({ email, password: "ValidPass123!", mfaCode: code })).resolves.toMatchObject({
      user: { email, mfaEnabled: true },
      mfaRequired: false
    });
    expect(platform.listAuditLogs().map((log) => log.action)).toEqual(
      expect.arrayContaining(["MFA_SETUP_STARTED", "MFA_ENABLED", "AUTH_MFA_REQUIRED", "AUTH_MFA_FAILED"])
    );
  });

  it("updates notification preferences and suppresses disabled alert types", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const strategy = platform.createStrategy(userId, {
      name: "Quiet Signals",
      status: "ACTIVE",
      configuration: {}
    });

    const updated = platform.updateProfile(userId, {
      notificationPreferences: {
        signal: false
      }
    });
    await platform.generateTradingSignal(userId, {
      strategyId: strategy.id,
      symbol: "AAPL"
    });

    expect(updated.notificationPreferences.signal).toBe(false);
    expect(updated.notificationPreferences.trade).toBe(true);
    expect(platform.listNotifications(userId).some((notification) => notification.notificationType === "SIGNAL")).toBe(false);
    expect(platform.listAuditLogs().map((log) => log.action)).toContain("PROFILE_UPDATED");
  });

  it("seeds E2E admin users through the Prisma bootstrap path when configured", async () => {
    process.env.ENABLE_E2E_SEED = "true";
    process.env.E2E_ADMIN_EMAIL = "seeded-admin@example.com";
    process.env.E2E_ADMIN_PASSWORD = "SeededAdmin123!";
    const persistUserBootstrap = vi.fn().mockResolvedValue(undefined);
    const fakeRepository = {
      hydrate: vi.fn().mockResolvedValue(undefined),
      isEnabled: vi.fn(() => true),
      persistUserBootstrap,
      persistSession: vi.fn().mockResolvedValue(undefined)
    } as unknown as PrismaPlatformRepository;
    const store = new PlatformStore();
    const platform = new PlatformService(
      store,
      new TokenService(),
      new MfaService(),
      new PaperBrokerAdapter(),
      new AlpacaBrokerAdapter(),
      new BrokerCredentialService(),
      new SessionActivityService(store, fakeRepository),
      new DatabaseHealthService(new PrismaService()),
      new PrismaAuditSink(new PrismaService()),
      fakeRepository,
      new SupabaseCacheQueueService(new PrismaService()),
      new OperationalMetricsService(),
      new RealtimeEventBus()
    );

    await platform.onModuleInit();
    const admin = platform.listAdminUsers().find((user) => user.email === "seeded-admin@example.com");

    expect(admin?.role).toBe("ADMIN");
    expect(persistUserBootstrap).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: "seeded-admin@example.com", role: "ADMIN" }),
        portfolios: expect.arrayContaining([expect.objectContaining({ portfolioName: "Broker Account" })]),
        brokerAccounts: expect.arrayContaining([expect.objectContaining({ brokerName: "PAPER" })]),
        riskRules: expect.arrayContaining([expect.objectContaining({ maxRiskPerTradePercent: 1 })]),
        watchlists: expect.arrayContaining([expect.objectContaining({ symbols: [] })])
      })
    );
    await expect(platform.login({ email: "seeded-admin@example.com", password: "SeededAdmin123!" })).resolves.toMatchObject({
      user: { role: "ADMIN" }
    });
  });

  it("creates a signal and executes a risk-approved paper trade", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const strategy = platform.createStrategy(userId, {
      name: "Momentum Guard",
      description: "Risk-first momentum",
      status: "ACTIVE",
      configuration: { riskPercent: 1 }
    });
    const signal = await platform.generateTradingSignal(userId, {
      strategyId: strategy.id,
      symbol: "AAPL"
    });
    const price = (await platform.getMarketQuote(userId, "AAPL", "1m")).price;
    const result = await platform.createOrder(userId, {
      strategyId: strategy.id,
      signalId: signal.id,
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "SEMI_AUTO",
      quantity: 5,
      price,
      stopLoss: Number((price * 0.98).toFixed(2)),
      takeProfit: Number((price * 1.05).toFixed(2))
    });

    expect(result.riskDecision.approved).toBe(true);
    expect(result.order.status).toBe("FILLED");
    expect(platform.listOrderStatusHistory(userId, result.order.id).map((event) => event.status)).toEqual([
      "PENDING",
      "SUBMITTED",
      "FILLED"
    ]);
    expect(platform.listTrades(userId)).toHaveLength(1);
    expect(platform.listPositions(userId)[0]?.symbol).toBe("AAPL");
  });

  it("realizes PnL correctly when reducing a position and excludes open fills from analytics", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const entryPrice = (await platform.getMarketQuote(userId, "AAPL", "1m")).price;

    await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "MANUAL",
      quantity: 5,
      price: entryPrice,
      stopLoss: entryPrice - 10,
      takeProfit: entryPrice + 20
    });
    expect(platform.getPerformance(userId).equityCurve).toEqual([100_000]);
    const entryTrade = platform.listTrades(userId)[0];

    await platform.markPositionsToMarket(userId, "AAPL", entryPrice + 5);
    await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "SELL",
      orderType: "MARKET",
      mode: "MANUAL",
      quantity: 2,
      price: entryPrice + 5,
      stopLoss: entryPrice + 15,
      takeProfit: entryPrice - 5
    });

    const position = platform.listPositions(userId)[0];
    const portfolio = platform.getPrimaryPortfolio(userId);
    const performance = platform.getPerformance(userId);
    const closingTrade = platform.listTrades(userId).find((trade) => trade.closedAt !== undefined);

    expect(position).toMatchObject({ quantity: 3, averagePrice: entryTrade?.entryPrice });
    expect(closingTrade?.entryPrice).toBe(entryTrade?.entryPrice);
    expect(closingTrade?.exitPrice).toBeGreaterThanOrEqual(closingTrade?.entryPrice ?? Number.POSITIVE_INFINITY);
    expect(closingTrade?.pnl).toBeGreaterThanOrEqual(0);
    expect(portfolio.portfolioValue).toBeGreaterThan(0);
    expect(portfolio.realizedPnl).toBe(closingTrade?.pnl);
    expect(performance.winRate).toBeGreaterThanOrEqual(0);
    expect(performance.equityCurve.length).toBeGreaterThan(0);
  });

  it("marks open positions and portfolio equity to the latest paper quote", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const quote = await platform.getMarketQuote(userId, "AAPL", "1m");
    const execution = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "MARKET",
      mode: "MANUAL",
      quantity: 5,
      price: quote.price,
      stopLoss: Number((quote.price - 20).toFixed(2)),
      takeProfit: Number((quote.price + 20).toFixed(2))
    });
    const fillPrice = execution.order.price;

    const marked = await platform.markPositionsToMarket(userId, "AAPL", fillPrice + 10);

    expect(marked.positions[0]).toMatchObject({
      symbol: "AAPL",
      unrealizedPnl: 50
    });
    expect(marked.portfolio).toMatchObject({
      portfolioValue: 100_050,
      realizedPnl: 0,
      unrealizedPnl: 50
    });
    expect(platform.getPerformance(userId).winRate).toBe(0);
  });

  it("serves timeframe-aware market data with ATR and volume indicators", async () => {
    const { platform } = createPlatform();
    const candles = await platform.listMarketData(undefined, "MSFT", "1h");
    const indicators = await platform.getIndicators(undefined, "MSFT", "1h");
    const quote = await platform.getMarketQuote(undefined, "MSFT", "1h");

    expect(candles[0]?.timeframe).toBe("1h");
    expect(candles[0]?.symbol).toBe("MSFT");
    expect(indicators.atr).toBeTypeOf("number");
    expect(indicators.volume.latest).toBeGreaterThan(0);
    expect(indicators.volume.sma).toBeGreaterThan(0);
    expect(quote).toMatchObject({
      symbol: "MSFT",
      source: "ALPACA"
    });
    expect(quote.ask).toBeGreaterThanOrEqual(quote.bid);
  });

  it("runs fully automated signal generation, position sizing, risk validation, and paper execution", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const strategy = platform.createStrategy(userId, {
      name: "Autonomous Guard",
      description: "Fully automated risk-first strategy",
      status: "ACTIVE",
      configuration: {
        confidenceThreshold: 0,
        stopLossPercent: 15,
        takeProfitPercent: 8
      }
    });

    const result = await platform.runAutomation(userId, {
      strategyId: strategy.id,
      symbol: "AAPL"
    });
    const actions = platform.listAuditLogs().map((log) => log.action);

    expect(result.status).toBe("EXECUTED");
    expect(result.execution?.order.mode).toBe("AUTO");
    expect(result.execution?.order.status).toBe("FILLED");
    expect(result.execution?.riskDecision.approved).toBe(true);
    expect(result.execution?.order.quantity).toBeCloseTo(result.execution?.riskDecision.calculatedQuantity ?? 0, 4);
    expect(actions).toContain("AUTOMATION_RUN_STARTED");
    expect(actions).toContain("AUTOMATION_ORDER_REQUESTED");
    expect(actions).toContain("AUTOMATION_EXECUTED");
  });

  it("runs audited historical backtests with trading costs", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const strategy = platform.createStrategy(userId, {
      name: "Backtest Guard",
      status: "ACTIVE",
      configuration: {
        fastPeriod: 5,
        slowPeriod: 12,
        feePerTrade: 1,
        slippagePercent: 0.05
      }
    });

    const result = await platform.runBacktest(userId, {
      strategyId: strategy.id,
      symbol: "AAPL",
      timeframe: "1h"
    });

    expect(result.strategyId).toBe(strategy.id);
    expect(result.symbol).toBe("AAPL");
    expect(result.timeframe).toBe("1h");
    expect(result.performance.equityCurve.length).toBe(result.totalTrades + 1);
    expect(platform.listNotifications(userId).some((notification) => notification.title === "Backtest completed")).toBe(true);
    expect(platform.listAuditLogs().map((log) => log.action)).toContain("BACKTEST_RUN");
  });

  it("runs audited walk-forward testing across out-of-sample windows", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const result = await platform.runWalkForwardBacktest(userId, {
      symbol: "AAPL",
      timeframe: "1h",
      startingEquity: 100_000,
      trainSize: 45,
      testSize: 20,
      feePerTrade: 1,
      slippagePercent: 0.05
    });

    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0]?.testingStart).toBeTruthy();
    expect(platform.listAuditLogs().map((log) => log.action)).toContain("WALK_FORWARD_BACKTEST_RUN");
    expect(
      platform.listNotifications(userId).some(
        (notification) => notification.title === "Walk-forward test completed"
      )
    ).toBe(true);
  });

  it("exports audited CSV and PDF performance reports", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });

    const csv = platform.exportPerformanceReport(userId, "csv");
    const pdf = platform.exportPerformanceReport(userId, "pdf");
    const csvText = Buffer.from(csv.contentBase64, "base64").toString("utf8");
    const pdfText = Buffer.from(pdf.contentBase64, "base64").toString("ascii");

    expect(csv.contentType).toBe("text/csv");
    expect(csvText).toContain("winRate");
    expect(csvText).toContain("sortinoRatio");
    expect(csvText).toContain("averageTrade");
    expect(csvText).toContain("riskRewardRatio");
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfText).toContain("Sortino Ratio");
    expect(platform.listAuditLogs().filter((log) => log.action === "PERFORMANCE_REPORT_EXPORTED")).toHaveLength(2);
  });

  it("exposes audited operational metrics without requiring Supabase", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const strategy = platform.createStrategy(userId, {
      name: "Metrics Guard",
      status: "ACTIVE",
      configuration: {}
    });
    await platform.generateTradingSignal(userId, { strategyId: strategy.id, symbol: "AAPL" });

    const metrics = await platform.getOperationalMetrics(userId);

    expect(metrics.signals.total).toBe(1);
    expect(metrics.signals.modelVersions.length).toBeGreaterThan(0);
    expect(metrics.notificationQueue).toEqual({ configured: false, depth: null });
    expect(platform.listAuditLogs().map((log) => log.action)).toContain("ADMIN_METRICS_VIEWED");
  });

  it("rejects trades before broker execution when risk rules fail", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });

    await expect(
      platform.createOrder(userId, {
        symbol: "AAPL",
        side: "BUY",
        orderType: "MARKET",
        mode: "AUTO",
        quantity: 10_000,
        price: 200,
        stopLoss: 150,
        takeProfit: 240
      })
    ).rejects.toMatchObject({
      response: {
        code: "RISK_REJECTED"
      }
    });

    expect(platform.listTrades(userId)).toHaveLength(0);
    const rejectedOrder = platform.listOrders(userId)[0];
    expect(rejectedOrder?.status).toBe("REJECTED");
    expect(platform.listOrderStatusHistory(userId, rejectedOrder?.id ?? "")).toEqual([
      expect.objectContaining({ status: "REJECTED" })
    ]);
  });

  it("enforces the compliance ceiling for risk per trade configuration", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });

    expect(() =>
      platform.updateRiskRules(userId, {
        maxRiskPerTradePercent: 2.01
      })
    ).toThrow("2% compliance ceiling");
    expect(platform.getRiskRules(userId).maxRiskPerTradePercent).toBe(1);
  });

  it("uses the broker abstraction for paper execution", async () => {
    const broker = new PaperBrokerAdapter();
    const ready = await broker.validateConnection();

    expect(ready).toBe(true);
    expect(broker.name).toBe("PAPER");
  });

  it("reevaluates pending paper limit orders against new market prices", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const currentPrice = (await platform.getMarketQuote(userId, "AAPL", "1m")).price;
    const limitPrice = Number((currentPrice - 2).toFixed(2));
    const submitted = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "LIMIT",
      mode: "MANUAL",
      quantity: 1,
      price: limitPrice,
      stopLoss: Number((limitPrice - 5).toFixed(2)),
      takeProfit: Number((limitPrice + 10).toFixed(2))
    });

    expect(submitted.order.status).toBe("SUBMITTED");
    expect(platform.listTrades(userId)).toHaveLength(0);
    expect(platform.listOrderStatusHistory(userId, submitted.order.id).map((event) => event.status)).toEqual([
      "PENDING",
      "SUBMITTED"
    ]);

    const executions = await platform.processPendingPaperOrders("AAPL", limitPrice - 0.5);
    expect(executions[0]?.order.status).toBe("FILLED");
    expect(executions[0]?.trade?.entryPrice).toBe(limitPrice - 0.5);
    expect(platform.listOrderStatusHistory(userId, submitted.order.id).map((event) => event.status)).toEqual([
      "PENDING",
      "SUBMITTED",
      "FILLED"
    ]);
  });

  it("blocks a marketable pending order when current risk rules no longer approve it", async () => {
    const submitOrder = vi.spyOn(PaperBrokerAdapter.prototype, "submitOrder");
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const currentPrice = (await platform.getMarketQuote(userId, "AAPL", "1m")).price;
    const limitPrice = Number((currentPrice - 2).toFixed(2));
    const submitted = await platform.createOrder(userId, {
      symbol: "AAPL",
      side: "BUY",
      orderType: "LIMIT",
      mode: "MANUAL",
      quantity: 1,
      price: limitPrice,
      stopLoss: Number((limitPrice - 5).toFixed(2)),
      takeProfit: Number((limitPrice + 10).toFixed(2))
    });
    expect(submitOrder).toHaveBeenCalledTimes(1);

    platform.updateRiskRules(userId, {
      maxPositionSizePercent: 0.1
    });
    const executions = await platform.processPendingPaperOrders("AAPL", limitPrice - 0.5);
    const rejected = platform.listOrders(userId).find((order) => order.id === submitted.order.id);

    expect(executions).toHaveLength(0);
    expect(submitOrder).toHaveBeenCalledTimes(1);
    expect(rejected).toMatchObject({
      status: "REJECTED",
      riskDecision: {
        approved: false,
        reasons: expect.arrayContaining(["Trade exceeds maximum position size."])
      }
    });
    expect(platform.listTrades(userId)).toHaveLength(0);
    expect(platform.listOrderStatusHistory(userId, submitted.order.id).map((event) => event.status)).toEqual([
      "PENDING",
      "SUBMITTED",
      "REJECTED"
    ]);
    expect(platform.listAuditLogs().map((log) => log.action)).toContain(
      "RISK_REJECTED_PENDING_ORDER"
    );
    expect(
      platform.listNotifications(userId).some(
        (notification) => notification.title === "Pending order blocked at execution"
      )
    ).toBe(true);
  });

  it("validates Alpaca credentials and never exposes credential material", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: !url.includes("/v2/account"),
        status: url.includes("/v2/account") ? 401 : 404,
        json: async () => ({})
      }))
    );

    await expect(
      platform.connectBroker(userId, {
        brokerName: "ALPACA",
        accountId: "paper-account",
        apiKey: "invalid-key",
        secret: "invalid-secret"
      })
    ).rejects.toMatchObject({ response: { code: "BROKER_CREDENTIALS_INVALID" } });
    expect(platform.listBrokerAccounts(userId).filter((account) => account.brokerName === "ALPACA")).toHaveLength(0);

    installAlpacaFetchMock();
    const connected = await platform.connectBroker(userId, {
      brokerName: "ALPACA",
      accountId: "paper-account",
      apiKey: "validated-key",
      secret: "validated-secret"
    });
    expect(connected).toMatchObject({
      brokerName: "ALPACA",
      status: "CONNECTED",
      hasCredentials: true
    });
    expect(connected).not.toHaveProperty("encryptedApiKey");
    expect(connected).not.toHaveProperty("encryptedSecret");
    const serializedAudit = JSON.stringify(
      platform.listAuditLogs().filter((log) => log.entityType === "BROKER_ACCOUNT")
    );
    expect(serializedAudit).not.toContain("validated-key");
    expect(serializedAudit).not.toContain("validated-secret");
  });

  it("reports Supabase readiness without logging secrets", async () => {
    const { platform } = createPlatform();
    const health = await platform.getSystemHealth();

    expect(health.api).toBe("ok");
    expect(health.supabase).toMatchObject({
      mode: "supabase",
      configured: false,
      status: "not_configured"
    });
  });

  it("records immutable audit events for admin dashboard reads", async () => {
    const { platform, store } = createPlatform();
    const { userId } = await registerAndLogin(platform, store, { fundPaper: 100_000 });

    platform.listAdminUsers(userId);
    await platform.getSystemHealth(userId);
    platform.listAuditLogs(userId);

    const actions = platform.listAuditLogs().map((log) => log.action);
    expect(actions).toContain("ADMIN_USERS_VIEWED");
    expect(actions).toContain("ADMIN_SYSTEM_HEALTH_VIEWED");
    expect(actions).toContain("ADMIN_AUDIT_LOGS_VIEWED");
  });

  it("lets administrators suspend users and revokes the target sessions", async () => {
    const { platform, store } = createPlatform();
    const actor = await registerAndLogin(platform, store, { fundPaper: 100_000 });
    const targetEmail = `suspend-${randomUUID()}@example.com`;
    await platform.register({
      email: targetEmail,
      password: "ValidPass123!",
      firstName: "Target",
      lastName: "Trader"
    });
    const targetLogin = await platform.login({ email: targetEmail, password: "ValidPass123!" });

    const updated = await platform.updateAdminUserStatus(actor.userId, targetLogin.user.id, {
      status: "SUSPENDED"
    });

    expect(updated.status).toBe("SUSPENDED");
    await expect(platform.refresh({ refreshToken: targetLogin.refreshToken })).rejects.toThrow();
    await expect(platform.login({ email: targetEmail, password: "ValidPass123!" })).rejects.toMatchObject({
      response: { code: "USER_SUSPENDED" }
    });
    expect(platform.listAuditLogs().map((log) => log.action)).toContain("ADMIN_USER_STATUS_UPDATED");
  });
});
