"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CandlestickChart,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Download,
  FlaskConical,
  History,
  Home,
  LineChart,
  ListFilter,
  Lock,
  LogOut,
  Play,
  Plus,
  Radio,
  Save,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
  WalletCards
} from "lucide-react";
import type { FormEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import type {
  AuditLog,
  AutomationMode,
  AutonomousBootstrapResult,
  AutomationRunResult,
  AutomationSettings,
  AuthTokens,
  BacktestResult,
  BrokerAccountView,
  DondieAgent,
  DondieLifestyleWorld,
  DondieMemory,
  DondieRunResult,
  IndicatorSnapshot,
  JsonObject,
  MarketCandle,
  MarketQuote,
  MarketTimeframe,
  MfaSetup,
  Notification,
  OperationalMetricsSnapshot,
  Order,
  OrderExecutionPayload,
  OrderSide,
  OrderType,
  PerformanceReport,
  PerformanceSummary,
  Portfolio,
  Position,
  PublicUser,
  RealtimeEvent,
  RiskRules,
  Signal,
  Strategy,
  Trade,
  WalkForwardResult
} from "@trading/types";
import { AITradeCopilot } from "../components/control-room/ai-trade-copilot";
import { AutomationModesPanel } from "../components/control-room/automation-modes";
import { BrokerConnectionCard } from "../components/control-room/broker-card";
import { HandsOffCapitalPanel } from "../components/control-room/hands-off-panel";
import { RiskResultBanner } from "../components/control-room/risk-result";
import { LandingPage } from "../components/landing-page";
import { BottomNav, DesktopNav, type ControlRoomTab } from "../components/nav/control-room-nav";
import { OfficeConsole } from "../components/office/office-console";
import { EmptyLine, MetricCard, Panel, SmallStat, StatusPill } from "../components/ui/primitives";
import { ApiError, REALTIME_BASE_URL, apiFetch, apiFetchPage } from "../lib/api";
import { signInWithSupabase, signOutSupabase } from "../lib/auth";
import { consumeAuthFailureMessage } from "../lib/auth-session";
import { formatCurrency, formatCurrencyTooltip, formatPercent, formatQty, insufficientHistoryLabel } from "../lib/format";
import { type OrderDraft, buildOrderDraftFromSignal } from "../lib/order-draft";
import {
  formatRiskResultMessage,
  parseStructuredRiskError,
  type StructuredRiskResult
} from "../lib/risk-display";
import { isSupabaseAuthEnabled } from "../lib/supabase/client";
import { useSessionStore } from "../store/session";

interface WatchlistView {
  readonly id: string;
  readonly name: string;
  readonly symbols: readonly string[];
}

interface SystemHealthView {
  readonly api?: string;
  readonly persistenceMode?: string;
  readonly supabase?: JsonObject;
  readonly broker?: string;
  readonly aiService?: string;
  readonly uptimeSeconds?: number;
}

interface StrategyTemplate {
  readonly name: string;
  readonly description: string;
  readonly timeframe: MarketTimeframe | "custom";
  readonly riskProfile: string;
  readonly indicators: readonly string[];
}

const strategyTemplates: readonly StrategyTemplate[] = [
  {
    name: "Momentum",
    description: "High-confidence momentum continuation using EMA, RSI, MACD, and volume confirmation.",
    timeframe: "1h",
    riskProfile: "moderate",
    indicators: ["EMA", "RSI", "MACD", "Volume"]
  },
  {
    name: "Trend following",
    description: "Slower trend capture focused on moving-average alignment and ATR-aware exits.",
    timeframe: "4h",
    riskProfile: "balanced",
    indicators: ["SMA", "EMA", "ATR", "MACD"]
  },
  {
    name: "Mean reversion",
    description: "Counter-trend entries around stretched RSI and Bollinger Band extremes.",
    timeframe: "1h",
    riskProfile: "moderate",
    indicators: ["RSI", "Bollinger Bands", "ATR"]
  },
  {
    name: "Breakout",
    description: "Volatility expansion strategy for range breaks with strict stop placement.",
    timeframe: "15m",
    riskProfile: "aggressive",
    indicators: ["ATR", "Volume", "Bollinger Bands"]
  },
  {
    name: "Conservative swing",
    description: "Lower-turnover swing setup with smaller per-trade risk and wider confirmation.",
    timeframe: "1d",
    riskProfile: "conservative",
    indicators: ["SMA", "RSI", "ATR"]
  },
  {
    name: "Custom",
    description: "Operator-defined strategy shell for custom signals and risk controls.",
    timeframe: "custom",
    riskProfile: "custom",
    indicators: ["Custom"]
  }
];

const defaultStrategyTemplate = strategyTemplates[0] as StrategyTemplate;
const timeframes: readonly MarketTimeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const featureNumber = (features: JsonObject, key: string): number | null => {
  const value = features[key];
  return typeof value === "number" ? value : null;
};

const jsonText = (value: JsonObject | undefined, key: string, fallback = "unknown"): string => {
  const nested = value?.[key];
  return typeof nested === "string" || typeof nested === "number" || typeof nested === "boolean"
    ? String(nested)
    : fallback;
};

const formatIndicator = (value: number | null | undefined, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "Loading";

const formatRatio = (value: number | undefined): string => {
  if (value === Infinity) {
    return "Inf";
  }
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "0.00";
};

const analyticsValue = (
  closedTrades: number,
  value: number | undefined,
  formatter: (input: number | undefined) => string = formatRatio
): string => {
  const unavailable = insufficientHistoryLabel(closedTrades);
  return unavailable || formatter(value);
};

const downloadReport = (report: PerformanceReport): void => {
  const binary = window.atob(report.contentBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: report.contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = report.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const refreshableQueryKeys = [
  ["portfolios"],
  ["strategies"],
  ["signals"],
  ["orders"],
  ["trades"],
  ["positions"],
  ["risk"],
  ["analytics"],
  ["notifications"],
  ["profile"],
  ["market-prices"],
  ["market-quote"],
  ["market-indicators"],
  ["watchlists"],
  ["broker-accounts"],
  ["automation-settings"],
  ["admin-audit"],
  ["admin-users"],
  ["admin-health"],
  ["admin-metrics"],
  ["dondie"],
  ["dondie-wallet"],
  ["dondie-memories"],
  ["dondie-lifestyle"],
  ["dondie-scheduler"],
  ["dondie-activities"]
] as const;

const normalizeDraftCalculations = (draft: OrderDraft): OrderDraft => {
  const estimatedValue = Number((draft.price * draft.quantity).toFixed(2));
  const maxExpectedLoss = Number((Math.abs(draft.price - draft.stopLoss) * draft.quantity).toFixed(2));
  const rewardAmount = Math.abs(draft.takeProfit - draft.price) * draft.quantity;
  return {
    ...draft,
    estimatedValue,
    maxExpectedLoss,
    riskRewardRatio: maxExpectedLoss > 0 ? Number((rewardAmount / maxExpectedLoss).toFixed(2)) : 0
  };
};

const automationNotice = (payload: AutomationRunResult): string => {
  const summary = payload.summary
    ? ` ${payload.summary.symbolsScanned} scanned, ${payload.summary.opportunitiesFound} opportunity(s), ${payload.summary.tradesCreated} trade(s).`
    : "";
  if (payload.status === "EXECUTED") {
    return `Automated paper trade ${payload.execution?.order.status.toLowerCase() ?? "submitted"} for ${payload.symbol}.${summary}`;
  }
  return `Automation skipped for ${payload.symbol}: ${payload.reason ?? "No qualified setup."}${summary}`;
};

interface LiveFeedItem {
  readonly id: string;
  readonly at: string;
  readonly kind: "SIGNAL" | "ORDER" | "TRADE";
  readonly headline: string;
  readonly detail: string;
  readonly tone: "emerald" | "rose" | "amber" | "cyan" | "slate";
}

const LIVE_FEED_LIMIT = 40;

const createIdempotencyKey = (strategyId: string, symbol: string, timeframe: MarketTimeframe): string => {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${strategyId}:${symbol}:${timeframe}:${randomPart}`;
};

export default function Page(): ReactElement {
  const queryClient = useQueryClient();
  const { accessToken, user, setSession, clearSession } = useSessionStore();
  const supabaseAuthEnabled = isSupabaseAuthEnabled();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMfaCode, setLoginMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [auditFilter, setAuditFilter] = useState("");
  const [strategyName, setStrategyName] = useState("Momentum Guard");
  const [strategyTemplateName, setStrategyTemplateName] = useState<StrategyTemplate["name"]>("Momentum");
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState<MarketTimeframe>("1h");
  const [activeTab, setActiveTab] = useState<ControlRoomTab>("home");
  const [selectedStrategyId, setSelectedStrategyId] = useState("");
  const [watchlistInput, setWatchlistInput] = useState("");
  const [alpacaApiKey, setAlpacaApiKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [walkForwardResult, setWalkForwardResult] = useState<WalkForwardResult | null>(null);
  const [notice, setNotice] = useState("");
  const [riskNotice, setRiskNotice] = useState("");
  const [riskResult, setRiskResult] = useState<StructuredRiskResult | null>(null);
  const [riskPassed, setRiskPassed] = useState(false);
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const [automationRunResult, setAutomationRunResult] = useState<AutomationRunResult | null>(null);
  const [lastAutonomy, setLastAutonomy] = useState<AutonomousBootstrapResult | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [liveFeed, setLiveFeed] = useState<readonly LiveFeedItem[]>([]);
  const autoHandsOffAttempted = useRef(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");

  const token = accessToken ?? "";
  const authenticated = Boolean(accessToken && user);
  const showAdmin = user?.role === "ADMIN";
  const showDevDiagnostics = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (authenticated) {
      return;
    }
    const failureNotice = consumeAuthFailureMessage();
    if (failureNotice) {
      setNotice(failureNotice);
    }
  }, [authenticated]);

  useEffect(() => {
    if (!realtimeConnected) {
      return;
    }
    // Drop a stale cold-start banner once the API socket is live again.
    if (/could not reach the trading api/i.test(notice)) {
      setNotice("");
    }
  }, [notice, realtimeConnected]);

  const portfolios = useQuery({
    queryKey: ["portfolios", accessToken],
    enabled: authenticated,
    refetchInterval: authenticated ? 15_000 : false,
    queryFn: ({ signal }) => apiFetchPage<Portfolio>("/portfolios", { signal }, token)
  });
  const strategies = useQuery({
    queryKey: ["strategies", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<Strategy>("/strategies", { signal }, token)
  });
  const signals = useQuery({
    queryKey: ["signals", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<Signal>("/signals/history", { signal }, token)
  });
  const orders = useQuery({
    queryKey: ["orders", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<Order>("/orders", { signal }, token)
  });
  const trades = useQuery({
    queryKey: ["trades", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<Trade>("/trades/history", { signal }, token)
  });
  const positions = useQuery({
    queryKey: ["positions", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<Position>("/positions", { signal }, token)
  });
  const risk = useQuery({
    queryKey: ["risk", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetch<RiskRules>("/risk", { signal }, token)
  });
  const analytics = useQuery({
    queryKey: ["analytics", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetch<PerformanceSummary>("/analytics/performance", { signal }, token)
  });
  const notifications = useQuery({
    queryKey: ["notifications", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<Notification>("/notifications", { signal }, token)
  });
  const profile = useQuery({
    queryKey: ["profile", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetch<PublicUser>("/users/profile", { signal }, token)
  });
  const brokerAccounts = useQuery({
    queryKey: ["broker-accounts", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<BrokerAccountView>("/brokers/accounts", { signal }, token)
  });
  const automationSettings = useQuery({
    queryKey: ["automation-settings", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetch<AutomationSettings>("/automation/settings", { signal }, token)
  });
  const manualMarketEnabled =
    authenticated &&
    !automationSettings.isLoading &&
    automationSettings.data?.mode !== "AUTOPILOT";
  const marketPrices = useQuery({
    queryKey: ["market-prices", symbol, timeframe, accessToken],
    enabled: manualMarketEnabled,
    queryFn: ({ signal }) =>
      apiFetchPage<MarketCandle>(
        `/market/prices/${encodeURIComponent(symbol)}?timeframe=${timeframe}`,
        { signal },
        token
      )
  });
  const marketQuote = useQuery({
    queryKey: ["market-quote", symbol, timeframe, accessToken],
    // AUTOPILOT picks its own symbols — do not poll a manual ticker (avoids AAPL noise).
    // Wait until automation settings resolve so we do not race-poll AAPL on load.
    enabled: manualMarketEnabled,
    refetchInterval: realtimeConnected ? false : 5_000,
    queryFn: ({ signal }) =>
      apiFetch<MarketQuote>(
        `/market/quotes/${encodeURIComponent(symbol)}?timeframe=${timeframe}`,
        { signal },
        token
      )
  });
  const marketIndicators = useQuery({
    queryKey: ["market-indicators", symbol, timeframe, accessToken],
    enabled: manualMarketEnabled,
    queryFn: ({ signal }) =>
      apiFetch<IndicatorSnapshot>(
        `/market/indicators/${encodeURIComponent(symbol)}?timeframe=${timeframe}`,
        { signal },
        token
      )
  });
  const watchlists = useQuery({
    queryKey: ["watchlists", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetchPage<WatchlistView>("/market/watchlists", { signal }, token)
  });
  const auditLogs = useQuery({
    queryKey: ["admin-audit", accessToken],
    enabled: authenticated && showAdmin,
    queryFn: ({ signal }) => apiFetchPage<AuditLog>("/admin/audit-logs", { signal }, token)
  });
  const adminUsers = useQuery({
    queryKey: ["admin-users", accessToken],
    enabled: authenticated && showAdmin,
    queryFn: ({ signal }) => apiFetchPage<PublicUser>("/admin/users", { signal }, token)
  });
  const systemHealth = useQuery({
    queryKey: ["admin-health", accessToken],
    enabled: authenticated && showAdmin,
    queryFn: ({ signal }) => apiFetch<SystemHealthView>("/admin/system-health", { signal }, token)
  });
  const operationalMetrics = useQuery({
    queryKey: ["admin-metrics", accessToken],
    enabled: authenticated && showAdmin,
    refetchInterval: 10_000,
    queryFn: ({ signal }) => apiFetch<OperationalMetricsSnapshot>("/admin/metrics", { signal }, token)
  });
  const dondieAgent = useQuery({
    queryKey: ["dondie", accessToken],
    enabled: authenticated,
    queryFn: ({ signal }) => apiFetch<DondieAgent | null>("/dondie", { signal }, token)
  });
  const dondieMemories = useQuery({
    queryKey: ["dondie-memories", accessToken],
    enabled: authenticated && Boolean(dondieAgent.data),
    queryFn: ({ signal }) => apiFetch<readonly DondieMemory[]>("/dondie/memories", { signal }, token)
  });
  const schedulerStatus = useQuery({
    queryKey: ["dondie-scheduler", accessToken],
    enabled: authenticated,
    refetchInterval: 15_000,
    queryFn: ({ signal }) => apiFetch<import("@trading/types").SchedulerStatusView>("/dondie/scheduler", { signal }, token)
  });
  const tradeActivities = useQuery({
    queryKey: ["dondie-activities", accessToken],
    enabled: authenticated && Boolean(dondieAgent.data),
    refetchInterval: 10_000,
    queryFn: ({ signal }) =>
      apiFetch<readonly import("@trading/types").TradeActivity[]>("/dondie/activities", { signal }, token)
  });
  const dondieLifestyle = useQuery({
    queryKey: ["dondie-lifestyle", accessToken],
    enabled: authenticated,
    refetchInterval: authenticated ? 15_000 : false,
    queryFn: ({ signal }) => apiFetch<DondieLifestyleWorld>("/dondie/lifestyle", { signal }, token)
  });
  const dondieWallet = useQuery({
    queryKey: ["dondie-wallet", accessToken],
    enabled: authenticated && Boolean(dondieAgent.data),
    refetchInterval: authenticated ? 15_000 : false,
    queryFn: ({ signal }) =>
      apiFetch<{
        readonly balance: number;
        readonly tier: DondieAgent["tier"];
        readonly ledger: readonly { readonly reason: string; readonly amount: number; readonly createdAt: string }[];
      }>("/dondie/wallet", { signal }, token)
  });

  const primaryPortfolio = portfolios.data?.[0];
  const latestSignal = signals.data?.[signals.data.length - 1];
  const activeStrategy = useMemo(
    () => strategies.data?.find((strategy) => strategy.status === "ACTIVE") ?? strategies.data?.[0],
    [strategies.data]
  );
  const selectedStrategy = useMemo(
    () =>
      strategies.data?.find((strategy) => strategy.id === selectedStrategyId) ??
      activeStrategy,
    [activeStrategy, selectedStrategyId, strategies.data]
  );
  const selectedTemplate = useMemo(
    () =>
      strategyTemplates.find((template) => template.name === strategyTemplateName) ??
      defaultStrategyTemplate,
    [strategyTemplateName]
  );
  const latestCandle = marketPrices.data?.[marketPrices.data.length - 1];
  const closedTradeCount = useMemo(
    () => (trades.data ?? []).filter((trade) => Boolean(trade.closedAt)).length,
    [trades.data]
  );
  const brokerConnected = useMemo(
    () =>
      (brokerAccounts.data ?? []).some(
        (account) =>
          account.status === "CONNECTED" &&
          (account.hasCredentials || account.brokerName === "PAPER")
      ),
    [brokerAccounts.data]
  );
  const alpacaConnected = useMemo(
    () =>
      (brokerAccounts.data ?? []).some(
        (account) =>
          account.status === "CONNECTED" &&
          account.brokerName === "ALPACA" &&
          account.hasCredentials
      ),
    [brokerAccounts.data]
  );
  const openControlRoomTab = (tab: ControlRoomTab): void => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const openBrokerConnection = (): void => {
    openControlRoomTab("settings");
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("broker-connection")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 50);
    }
  };
  const brokerSetupNotice =
    notice.toLowerCase().includes("alpaca") || notice.toLowerCase().includes("broker");
  const currentOrderDraft = useMemo(() => {
    if (!latestSignal) {
      return null;
    }
    return buildOrderDraftFromSignal({
      signal: latestSignal,
      quote: marketQuote.data ?? null,
      equity: primaryPortfolio?.portfolioValue ?? 0,
      risk: risk.data ?? null
    });
  }, [latestSignal, marketQuote.data, primaryPortfolio?.portfolioValue, risk.data]);
  const visibleAuditLogs = useMemo(() => {
    const filter = auditFilter.trim().toLowerCase();
    const logs = auditLogs.data ?? [];
    if (!filter) {
      return logs;
    }
    return logs.filter((log) =>
      `${log.action} ${log.entityType} ${log.userId ?? ""} ${JSON.stringify(log.metadata)}`
        .toLowerCase()
        .includes(filter)
    );
  }, [auditFilter, auditLogs.data]);

  useEffect(() => {
    if (selectedStrategyId) {
      return;
    }
    const managed = strategies.data?.find(
      (strategy) => strategy.configuration.agentManaged === true && strategy.status === "ACTIVE"
    );
    if (managed) {
      setSelectedStrategyId(managed.id);
      return;
    }
    if (activeStrategy?.id) {
      setSelectedStrategyId(activeStrategy.id);
    }
  }, [activeStrategy?.id, selectedStrategyId, strategies.data]);

  useEffect(() => {
    setOrderDraft(null);
    setRiskResult(null);
    setRiskPassed(false);
  }, [latestSignal?.id, symbol]);

  useEffect(() => {
    if (!authenticated) {
      setRealtimeConnected(false);
      return;
    }

    const socket = io(REALTIME_BASE_URL, {
      path: "/ws",
      auth: { token },
      transports: ["websocket"]
    });

    const subscribe = (): void => {
      // AUTOPILOT owns its universe — skip the default manual AAPL quote stream.
      if (automationSettings.data?.mode === "AUTOPILOT") {
        return;
      }
      socket.emit("market:subscribe", { symbols: [symbol], timeframe });
    };
    const pushLiveFeed = (item: Omit<LiveFeedItem, "id" | "at">): void => {
      setLiveFeed((previous) =>
        [{ ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: new Date().toISOString() }, ...previous].slice(
          0,
          LIVE_FEED_LIMIT
        )
      );
    };

    const handleRealtimeEvent = (event: RealtimeEvent): void => {
      switch (event.type) {
        case "market.price":
          queryClient.setQueryData(
            ["market-quote", event.data.quote.symbol, event.data.timeframe, accessToken],
            event.data.quote
          );
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["positions"] }),
            queryClient.invalidateQueries({ queryKey: ["portfolios"] })
          ]);
          break;
        case "signal.updated":
          pushLiveFeed({
            kind: "SIGNAL",
            headline: `${event.data.signal.symbol} signal: ${event.data.signal.signalType}`,
            detail: `${event.data.signal.confidenceScore}% confidence`,
            tone:
              event.data.signal.signalType === "BUY"
                ? "emerald"
                : event.data.signal.signalType === "SELL"
                  ? "rose"
                  : "slate"
          });
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["signals"] }),
            queryClient.invalidateQueries({ queryKey: ["dondie-lifestyle"] }),
            queryClient.invalidateQueries({ queryKey: ["dondie"] }),
            queryClient.invalidateQueries({ queryKey: ["dondie-memories"] })
          ]);
          break;
        case "order.updated":
          pushLiveFeed({
            kind: "ORDER",
            headline: `${event.data.order.symbol} order ${event.data.statusEvent.status}`,
            detail: `${event.data.order.side} ${formatQty(event.data.order.quantity)} @ ${formatCurrency(event.data.order.price)}`,
            tone:
              event.data.statusEvent.status === "REJECTED" || event.data.statusEvent.status === "CANCELLED"
                ? "rose"
                : event.data.statusEvent.status === "FILLED"
                  ? "emerald"
                  : "amber"
          });
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["orders"] }),
            queryClient.invalidateQueries({ queryKey: ["dondie-lifestyle"] }),
            queryClient.invalidateQueries({ queryKey: ["automation-settings"] })
          ]);
          break;
        case "trade.executed": {
          const trade = "trade" in event.data ? event.data.trade : undefined;
          const order = "order" in event.data ? event.data.order : undefined;
          if (trade) {
            pushLiveFeed({
              kind: "TRADE",
              headline: `${trade.symbol} filled ${trade.side} ${formatQty(trade.quantity)}`,
              detail: `@ ${formatCurrency(trade.entryPrice)}${trade.closedAt ? ` · P&L ${formatCurrency(trade.pnl)}` : ""}`,
              tone: trade.closedAt ? (trade.pnl >= 0 ? "emerald" : "rose") : "cyan"
            });
          } else if (order) {
            pushLiveFeed({
              kind: "TRADE",
              headline: `${order.symbol} order filled`,
              detail: `${order.side} ${formatQty(order.quantity)} @ ${formatCurrency(order.price)}`,
              tone: "emerald"
            });
          }
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["trades"] }),
            queryClient.invalidateQueries({ queryKey: ["positions"] }),
            queryClient.invalidateQueries({ queryKey: ["portfolios"] }),
            queryClient.invalidateQueries({ queryKey: ["analytics"] }),
            queryClient.invalidateQueries({ queryKey: ["dondie-lifestyle"] }),
            queryClient.invalidateQueries({ queryKey: ["dondie-wallet"] })
          ]);
          break;
        }
        case "notification.created":
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["notifications"] }),
            queryClient.invalidateQueries({ queryKey: ["dondie-lifestyle"] })
          ]);
          break;
      }
    };

    socket.on("connect", () => {
      setRealtimeConnected(true);
      subscribe();
    });
    socket.on("disconnect", () => {
      setRealtimeConnected(false);
    });
    socket.on("connect_error", () => {
      setRealtimeConnected(false);
    });
    socket.on("realtime:event", handleRealtimeEvent);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [
    accessToken,
    authenticated,
    automationSettings.data?.mode,
    queryClient,
    symbol,
    timeframe,
    token
  ]);

  const invalidateTradingData = async (): Promise<void> => {
    await Promise.all(
      refreshableQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    );
  };

  const selectedStrategyConfigurationNumber = (key: string, fallback: number): number =>
    selectedStrategy ? featureNumber(selectedStrategy.configuration, key) ?? fallback : fallback;

  const getExecutableDraft = (input?: OrderDraft): OrderDraft => {
    if (!latestSignal || !selectedStrategy) {
      throw new Error("Generate a signal first.");
    }
    const livePrice =
      marketQuote.data?.source !== "UNAVAILABLE" && marketQuote.data?.price && marketQuote.data.price > 0
        ? marketQuote.data.price
        : null;
    const sourceSignal =
      latestSignal.signalType === "HOLD"
        ? {
            ...latestSignal,
            signalType: "BUY" as const
          }
        : latestSignal;
    const rebuilt = buildOrderDraftFromSignal({
      signal: sourceSignal,
      quote: marketQuote.data ?? null,
      equity: primaryPortfolio?.portfolioValue ?? 0,
      risk: risk.data ?? null,
      stopLossPercent: selectedStrategyConfigurationNumber("stopLossPercent", 2),
      takeProfitPercent: selectedStrategyConfigurationNumber("takeProfitPercent", 5)
    });
    const draft = input ?? orderDraft ?? rebuilt;
    if (!draft || !rebuilt) {
      throw new Error("Unable to build an executable order draft from the latest signal.");
    }
    // Always re-anchor MARKET protective levels to the live quote so stale drafts cannot invert geometry.
    const synced: OrderDraft = {
      ...draft,
      side: rebuilt.side,
      signalType: rebuilt.signalType,
      price: livePrice ?? rebuilt.price,
      stopLoss: rebuilt.stopLoss,
      takeProfit: rebuilt.takeProfit,
      quantity: draft.quantity > 0 ? draft.quantity : rebuilt.quantity,
      priceAvailable: rebuilt.priceAvailable,
      confidence: rebuilt.confidence,
      reasoning: rebuilt.reasoning,
      risks: rebuilt.risks
    };
    if (!synced.priceAvailable || synced.price <= 0) {
      throw new Error("Live market price is unavailable. Load a quote before executing.");
    }
    if (synced.quantity <= 0) {
      throw new Error("Calculated position size is zero. Check equity, price, and risk rules.");
    }
    return normalizeDraftCalculations(synced);
  };

  const applySuggestedQuantity = (quantity: number): void => {
    const base = orderDraft ?? currentOrderDraft;
    if (!base) {
      return;
    }
    setOrderDraft(normalizeDraftCalculations({ ...base, quantity }));
  };

  const loginMutation = useMutation({
    mutationFn: () =>
      supabaseAuthEnabled
        ? signInWithSupabase(loginEmail, loginPassword)
        : apiFetch<AuthTokens>("/auth/login", {
            method: "POST",
            body: JSON.stringify({
              email: loginEmail,
              password: loginPassword,
              ...(loginMfaCode ? { mfaCode: loginMfaCode } : {})
            })
          }),
    onSuccess: async (tokens) => {
      setSession(tokens);
      setMfaChallenge(false);
      setLoginMfaCode("");
      setNotice(`Welcome, ${tokens.user.firstName}.`);
      setRiskNotice("");
      await invalidateTradingData();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "MFA_REQUIRED") {
        setMfaChallenge(true);
      }
      setNotice(error instanceof Error ? error.message : "Login failed.");
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (token) {
        await apiFetch<{ readonly loggedOut: true }>(
          "/auth/logout",
          {
            method: "POST",
            body: JSON.stringify({})
          },
          token
        ).catch(() => undefined);
      }
      await signOutSupabase();
    },
    onSettled: () => {
      clearSession();
      setNotice("Logged out.");
      setActiveTab("home");
      setMfaSetup(null);
      setMfaCode("");
      setOrderDraft(null);
      setRiskResult(null);
      setRiskPassed(false);
    }
  });

  const createStrategyMutation = useMutation({
    mutationFn: () =>
      apiFetch<Strategy>(
        "/strategies",
        {
          method: "POST",
          body: JSON.stringify({
            name: strategyName,
            description: selectedTemplate.description,
            status: "ACTIVE",
            configuration: {
              automationMode: "SEMI_AUTO",
              indicators: selectedTemplate.indicators,
              description: selectedTemplate.description,
              timeframe: selectedTemplate.timeframe,
              riskProfile: selectedTemplate.riskProfile,
              template: selectedTemplate.name,
              riskPercent: selectedTemplate.riskProfile === "conservative" ? 0.5 : 1,
              confidenceThreshold: selectedTemplate.riskProfile === "aggressive" ? 65 : 60,
              stopLossPercent: selectedTemplate.riskProfile === "conservative" ? 3 : 5,
              takeProfitPercent: selectedTemplate.riskProfile === "conservative" ? 6 : 8
            }
          })
        },
        token
      ),
    onSuccess: async (strategy) => {
      setSelectedStrategyId(strategy.id);
      setNotice(`Strategy ${strategy.name} created from ${selectedTemplate.name}.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Strategy creation failed.");
    }
  });

  const generateSignalMutation = useMutation({
    mutationFn: () => {
      if (!selectedStrategy) {
        throw new Error("Create a strategy first.");
      }
      return apiFetch<Signal>(
        "/signals/generate",
        {
          method: "POST",
          body: JSON.stringify({
            strategyId: selectedStrategy.id,
            selectedStrategyId: selectedStrategy.id,
            symbol,
            timeframe
          })
        },
        token
      );
    },
    onSuccess: async (signal) => {
      setOrderDraft(null);
      setRiskResult(null);
      setRiskPassed(false);
      setNotice(`${signal.signalType} signal generated for ${signal.symbol}.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Signal generation failed.");
    }
  });

  const executeTradeMutation = useMutation({
    mutationFn: (draftInput?: OrderDraft) => {
      if (!latestSignal || !selectedStrategy) {
        throw new Error("Generate a signal first.");
      }
      const draft = getExecutableDraft(draftInput);
      return apiFetch<OrderExecutionPayload>(
        "/orders",
        {
          method: "POST",
          body: JSON.stringify({
            strategyId: selectedStrategy.id,
            signalId: latestSignal.id,
            symbol: draft.symbol,
            side: draft.side,
            orderType: draft.orderType,
            mode: "SEMI_AUTO",
            // Omit quantity so the server risk engine sizes against the live fill price.
            price: draft.price,
            stopLoss: draft.stopLoss,
            takeProfit: draft.takeProfit
          })
        },
        token
      );
    },
    onSuccess: async (payload) => {
      setRiskPassed(true);
      setRiskResult(null);
      setRiskNotice("");
      setNotice(`Paper trade ${payload.order.status.toLowerCase()} for ${payload.order.symbol}.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      const structured = parseStructuredRiskError(error);
      if (structured) {
        setRiskResult(structured);
        setRiskPassed(false);
        setNotice(`Risk check failed: ${formatRiskResultMessage(structured)}`);
      } else {
        setNotice(error instanceof Error ? error.message : "Trade execution failed.");
      }
    }
  });

  const manualTradeMutation = useMutation({
    mutationFn: (order: {
      readonly symbol: string;
      readonly side: OrderSide;
      readonly orderType: OrderType;
      readonly quantity: number;
      readonly price: number;
      readonly stopLoss: number;
      readonly takeProfit: number;
    }) =>
      apiFetch<OrderExecutionPayload>(
        "/orders",
        {
          method: "POST",
          body: JSON.stringify({
            ...order,
            mode: "MANUAL"
          })
        },
        token
      ),
    onSuccess: async (payload) => {
      setRiskPassed(true);
      setRiskResult(null);
      setNotice(`Manual order ${payload.order.status.toLowerCase()} for ${payload.order.symbol}.`);
      await invalidateTradingData();
    },
    onError: async (error) => {
      const structured = parseStructuredRiskError(error);
      if (structured) {
        setRiskResult(structured);
        setRiskPassed(false);
        setNotice(`Manual order blocked: ${formatRiskResultMessage(structured)}`);
      } else {
        setNotice(error instanceof Error ? error.message : "Manual order failed.");
      }
      await invalidateTradingData();
    }
  });

  const activateDondieMutation = useMutation({
    mutationFn: () =>
      apiFetch<AutonomousBootstrapResult>("/dondie/go-autonomous", { method: "POST", body: "{}" }, token),
    onSuccess: async (autonomy) => {
      setLastAutonomy(autonomy);
      setSelectedStrategyId(autonomy.strategyId);
      setNotice(
        `${autonomy.strategyName} active on AUTOPILOT. Fund and withdraw in Alpaca — the agent handles the rest.`
      );
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Dondie activation failed.");
    }
  });

  const pauseDondieMutation = useMutation({
    mutationFn: () =>
      apiFetch<DondieAgent>("/dondie/pause", { method: "POST", body: JSON.stringify({}) }, token),
    onSuccess: async () => {
      setNotice("Dondie paused.");
      await queryClient.invalidateQueries({ queryKey: ["dondie"] });
      await queryClient.invalidateQueries({ queryKey: ["dondie-lifestyle"] });
    }
  });

  const resumeDondieMutation = useMutation({
    mutationFn: () =>
      apiFetch<DondieAgent>("/dondie/resume", { method: "POST", body: JSON.stringify({}) }, token),
    onSuccess: async () => {
      setNotice("Dondie resumed.");
      await queryClient.invalidateQueries({ queryKey: ["dondie"] });
      await queryClient.invalidateQueries({ queryKey: ["dondie-lifestyle"] });
    }
  });

  const runDondieMutation = useMutation({
    mutationFn: () => {
      // Hands-off: omit symbol so the agent scans its own universe.
      const handsOff = automationSettings.data?.mode === "AUTOPILOT";
      return apiFetch<DondieRunResult>(
        "/dondie/run",
        {
          method: "POST",
          body: JSON.stringify(handsOff ? { timeframe } : { symbol, timeframe })
        },
        token
      );
    },
    onSuccess: async (result) => {
      setAutomationRunResult(result.automation);
      const skipReason =
        result.automation.reasonCode
          ? `${result.automation.reasonCode}: ${result.automation.reason || result.reasoning}`
          : result.automation.reason || result.reasoning;
      setNotice(
        result.automation.status === "EXECUTED"
          ? `Dondie executed ${result.automation.symbol} via ${result.brain} brain (MANUAL_FORCE_SCAN).`
          : `Dondie scanned and skipped ${result.symbol}: ${skipReason}`
      );
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Dondie run failed.");
    }
  });

  const updateAutomationSettingsMutation = useMutation({
    mutationFn: (patch: Partial<AutomationSettings>) =>
      apiFetch<AutomationSettings>(
        "/automation/settings",
        {
          method: "PUT",
          body: JSON.stringify(patch)
        },
        token
      ),
    onSuccess: async (settings) => {
      setNotice(`Automation mode set to ${settings.mode}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automation-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["risk"] })
      ]);
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Automation settings update failed.");
    }
  });

  const emergencyPauseMutation = useMutation({
    mutationFn: () =>
      apiFetch<AutomationSettings>(
        "/automation/emergency-pause",
        { method: "POST", body: JSON.stringify({}) },
        token
      ),
    onSuccess: async () => {
      setNotice("Emergency pause engaged. Automation is now manual only.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automation-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["risk"] })
      ]);
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Emergency pause failed.");
    }
  });

  const automatedRunMutation = useMutation({
    mutationFn: () => {
      if (!selectedStrategy) {
        throw new Error("Create a strategy first.");
      }
      const idempotencyKey = createIdempotencyKey(selectedStrategy.id, symbol, timeframe);
      return apiFetch<AutomationRunResult>(
        "/automation/run",
        {
          method: "POST",
          body: JSON.stringify({
            strategyId: selectedStrategy.id,
            selectedStrategyId: selectedStrategy.id,
            symbol,
            timeframe,
            idempotencyKey,
            confidenceThreshold: automationSettings.data?.minimumConfidence ?? selectedStrategyConfigurationNumber("confidenceThreshold", 60),
            stopLossPercent: selectedStrategyConfigurationNumber("stopLossPercent", 5),
            takeProfitPercent: selectedStrategyConfigurationNumber("takeProfitPercent", 8)
          })
        },
        token
      );
    },
    onSuccess: async (payload) => {
      setAutomationRunResult(payload);
      if (payload.status === "EXECUTED") {
        setRiskPassed(true);
        setRiskResult(null);
      }
      setNotice(automationNotice(payload));
      await invalidateTradingData();
    },
    onError: (error) => {
      const structured = parseStructuredRiskError(error);
      if (structured) {
        setRiskResult(structured);
        setRiskPassed(false);
        setNotice(`Automation blocked: ${formatRiskResultMessage(structured)}`);
      } else {
        setNotice(error instanceof Error ? error.message : "Automation run failed.");
      }
    }
  });

  const invalidTradeMutation = useMutation({
    mutationFn: () =>
      apiFetch<OrderExecutionPayload>(
        "/orders",
        {
          method: "POST",
          body: JSON.stringify({
            symbol,
            side: "BUY",
            orderType: "MARKET",
            mode: "AUTO",
            quantity: 100000,
            price: marketQuote.data?.price ?? 200,
            stopLoss: Number(((marketQuote.data?.price ?? 200) * 0.75).toFixed(2)),
            takeProfit: Number(((marketQuote.data?.price ?? 200) * 1.3).toFixed(2))
          })
        },
        token
      ),
    onSuccess: async () => {
      setRiskNotice("Unexpected approval.");
      await invalidateTradingData();
    },
    onError: async (error) => {
      const structured = parseStructuredRiskError(error);
      const title = structured?.title ?? "Risk check failed";
      const message = structured?.message ?? (error instanceof Error ? error.message : "Invalid trade was rejected.");
      if (structured) {
        setRiskResult(structured);
      }
      setRiskPassed(false);
      setRiskNotice(`Risk rule blocked invalid trade: ${title} — ${message}`);
      await invalidateTradingData();
    }
  });

  const updateWatchlistMutation = useMutation({
    mutationFn: (symbols: readonly string[]) =>
      apiFetch<WatchlistView>(
        "/market/watchlists",
        {
          method: "PUT",
          body: JSON.stringify({ symbols })
        },
        token
      ),
    onSuccess: async (watchlist) => {
      setNotice(`Watchlist updated with ${watchlist.symbols.length} symbols.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Watchlist update failed.");
    }
  });

  const updateStrategyMutation = useMutation({
    mutationFn: (input: {
      readonly id: string;
      readonly body: {
        readonly name: string;
        readonly status: "ACTIVE" | "INACTIVE";
        readonly configuration: JsonObject;
      };
    }) =>
      apiFetch<Strategy>(
        `/strategies/${input.id}`,
        {
          method: "PUT",
          body: JSON.stringify(input.body)
        },
        token
      ),
    onSuccess: async (strategy) => {
      setSelectedStrategyId(strategy.id);
      setNotice(`Strategy ${strategy.name} updated.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Strategy update failed.");
    }
  });

  const updateRiskMutation = useMutation({
    mutationFn: (body: Record<string, number | boolean>) =>
      apiFetch<RiskRules>(
        "/risk",
        {
          method: "PUT",
          body: JSON.stringify(body)
        },
        token
      ),
    onSuccess: async (updatedRisk) => {
      await Promise.all([
        invalidateTradingData(),
        updateAutomationSettingsMutation.mutateAsync({
          emergencyStop: updatedRisk.stopTrading,
          riskPerTradePercent: updatedRisk.maxRiskPerTradePercent,
          maxPositionSizePercent: updatedRisk.maxPositionSizePercent,
          dailyLossLimitPercent: updatedRisk.maxDailyLossPercent,
          maxDrawdownPercent: updatedRisk.maxDrawdownPercent
        }).catch(() => undefined)
      ]);
      setNotice("Risk controls updated.");
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Risk update failed.");
    }
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (notificationPreferences: PublicUser["notificationPreferences"]) =>
      apiFetch<PublicUser>(
        "/users/profile",
        {
          method: "PUT",
          body: JSON.stringify({ notificationPreferences })
        },
        token
      ),
    onSuccess: async () => {
      setNotice("Alert preferences updated.");
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Preference update failed.");
    }
  });

  const connectBrokerMutation = useMutation({
    mutationFn: () =>
      apiFetch<BrokerAccountView>(
        "/brokers/connect",
        {
          method: "POST",
          body: JSON.stringify({
            brokerName: "ALPACA",
            environment: "PAPER",
            apiKey: alpacaApiKey.trim(),
            secret: alpacaSecret.trim()
          })
        },
        token
      ),
    onSuccess: async (account) => {
      setAlpacaApiKey("");
      setAlpacaSecret("");
      if (account.autonomy) {
        setLastAutonomy(account.autonomy);
        setSelectedStrategyId(account.autonomy.strategyId);
        setNotice(
          `Alpaca connected. Hands-off mode on — Dondie chose ${account.autonomy.strategyName}. Fund or withdraw in Alpaca; the agent trades on AUTOPILOT.`
        );
      } else {
        setNotice("Alpaca paper account connected. Balances and market data will load from your broker.");
      }
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Broker connection failed.");
    }
  });

  const goAutonomousMutation = useMutation({
    mutationFn: () =>
      apiFetch<AutonomousBootstrapResult>("/dondie/go-autonomous", { method: "POST", body: "{}" }, token),
    onSuccess: async (autonomy) => {
      setLastAutonomy(autonomy);
      setSelectedStrategyId(autonomy.strategyId);
      setNotice(
        `Hands-off mode active — ${autonomy.strategyName} on AUTOPILOT. Deposit and withdraw only in Alpaca.`
      );
      await invalidateTradingData();
    },
    onError: (error) => {
      autoHandsOffAttempted.current = false;
      setNotice(error instanceof Error ? error.message : "Could not start hands-off mode.");
    }
  });

  // Alpaca already connected (no reconnect needed): start hands-off once on load.
  useEffect(() => {
    if (!authenticated || !alpacaConnected || autoHandsOffAttempted.current) {
      return;
    }
    if (brokerAccounts.isLoading || automationSettings.isLoading || dondieAgent.isLoading) {
      return;
    }
    if (automationSettings.data?.emergencyStop) {
      return;
    }
    const alreadyHandsOff =
      automationSettings.data?.mode === "AUTOPILOT" && dondieAgent.data?.status === "ACTIVE";
    if (alreadyHandsOff) {
      autoHandsOffAttempted.current = true;
      return;
    }
    autoHandsOffAttempted.current = true;
    goAutonomousMutation.mutate();
  }, [
    authenticated,
    alpacaConnected,
    brokerAccounts.isLoading,
    automationSettings.isLoading,
    automationSettings.data?.emergencyStop,
    automationSettings.data?.mode,
    dondieAgent.isLoading,
    dondieAgent.data?.status,
    goAutonomousMutation
  ]);

  const markNotificationsReadMutation = useMutation({
    mutationFn: () =>
      apiFetch<readonly Notification[]>(
        "/notifications/read",
        {
          method: "PUT",
          body: JSON.stringify({})
        },
        token
      ),
    onSuccess: async () => {
      setNotice("Notifications marked as read.");
      await invalidateTradingData();
    }
  });

  const setupMfaMutation = useMutation({
    mutationFn: () =>
      apiFetch<MfaSetup>(
        "/auth/mfa/setup",
        {
          method: "POST",
          body: JSON.stringify({})
        },
        token
      ),
    onSuccess: (setup) => {
      setMfaSetup(setup);
      setMfaCode("");
      setNotice("Authenticator setup created.");
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "MFA setup failed.");
    }
  });

  const enableMfaMutation = useMutation({
    mutationFn: () =>
      apiFetch<PublicUser>(
        "/auth/mfa/enable",
        {
          method: "POST",
          body: JSON.stringify({ code: mfaCode })
        },
        token
      ),
    onSuccess: async () => {
      setMfaSetup(null);
      setMfaCode("");
      setNotice("Multi-factor authentication enabled.");
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "MFA enable failed.");
    }
  });

  const disableMfaMutation = useMutation({
    mutationFn: () =>
      apiFetch<PublicUser>(
        "/auth/mfa/disable",
        {
          method: "POST",
          body: JSON.stringify({ code: mfaCode })
        },
        token
      ),
    onSuccess: async () => {
      setMfaSetup(null);
      setMfaCode("");
      setNotice("Multi-factor authentication disabled.");
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "MFA disable failed.");
    }
  });

  const createAdminUserMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ readonly user: PublicUser; readonly temporaryPassword: string }>(
        "/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            email: newUserEmail,
            password: newUserPassword,
            firstName: newUserFirstName || "Platform",
            lastName: newUserLastName || "User",
            role: "TRADER"
          })
        },
        token
      ),
    onSuccess: async (result) => {
      setNotice(`User ${result.user.email} created. Share the temporary password securely.`);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserFirstName("");
      setNewUserLastName("");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "User creation failed.");
    }
  });

  const updateAdminUserStatusMutation = useMutation({
    mutationFn: (input: { readonly userId: string; readonly status: PublicUser["status"] }) =>
      apiFetch<PublicUser>(
        `/admin/users/${input.userId}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status: input.status })
        },
        token
      ),
    onSuccess: async (updated) => {
      setNotice(`${updated.email} is now ${updated.status.toLowerCase()}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "User status update failed.");
    }
  });

  const backtestMutation = useMutation({
    mutationFn: (body: {
      readonly strategyId?: string;
      readonly symbol: string;
      readonly timeframe: MarketTimeframe;
      readonly startingEquity: number;
      readonly fastPeriod: number;
      readonly slowPeriod: number;
      readonly maxPositionPercent: number;
      readonly feePerTrade: number;
      readonly slippagePercent: number;
    }) =>
      apiFetch<BacktestResult>(
        "/backtests/run",
        {
          method: "POST",
          body: JSON.stringify(body)
        },
        token
      ),
    onSuccess: async (result) => {
      setBacktestResult(result);
      setNotice(`Backtest completed with ${result.totalTrades} closed trades.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Backtest failed.");
    }
  });

  const walkForwardMutation = useMutation({
    mutationFn: (body: {
      readonly strategyId?: string;
      readonly symbol: string;
      readonly timeframe: MarketTimeframe;
      readonly startingEquity: number;
      readonly trainSize: number;
      readonly testSize: number;
      readonly maxPositionPercent: number;
      readonly feePerTrade: number;
      readonly slippagePercent: number;
    }) =>
      apiFetch<WalkForwardResult>(
        "/backtests/walk-forward",
        {
          method: "POST",
          body: JSON.stringify(body)
        },
        token
      ),
    onSuccess: async (result) => {
      setWalkForwardResult(result);
      setNotice(`Walk-forward test completed with ${result.windows.length} out-of-sample windows.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Walk-forward test failed.");
    }
  });

  const reportMutation = useMutation({
    mutationFn: (format: "csv" | "pdf") =>
      apiFetch<PerformanceReport>(`/reports/performance/${format}`, {}, token),
    onSuccess: async (report) => {
      downloadReport(report);
      setNotice(`${report.fileName} generated.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Report export failed.");
    }
  });

  const desktopTabs: readonly {
    readonly id: ControlRoomTab;
    readonly label: string;
    readonly testId: string;
    readonly icon: ReactElement;
  }[] = [
    { id: "home", label: "Office", testId: "tab-home", icon: <Home className="h-4 w-4" aria-hidden="true" /> },
    { id: "signals", label: "Signals", testId: "tab-signals", icon: <Sparkles className="h-4 w-4" aria-hidden="true" /> },
    { id: "trade", label: "Trade", testId: "tab-trade", icon: <CandlestickChart className="h-4 w-4" aria-hidden="true" /> },
    { id: "live", label: "Live", testId: "tab-live", icon: <Radio className="h-4 w-4" aria-hidden="true" /> },
    { id: "portfolio", label: "Portfolio", testId: "tab-portfolio", icon: <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" /> },
    { id: "market", label: "Market", testId: "tab-market", icon: <LineChart className="h-4 w-4" aria-hidden="true" /> },
    { id: "strategies", label: "Strategies", testId: "tab-strategies", icon: <Bot className="h-4 w-4" aria-hidden="true" /> },
    { id: "risk", label: "Risk", testId: "tab-risk", icon: <Shield className="h-4 w-4" aria-hidden="true" /> },
    { id: "lab", label: "Lab", testId: "tab-lab", icon: <FlaskConical className="h-4 w-4" aria-hidden="true" /> },
    { id: "settings", label: "Settings", testId: "tab-settings", icon: <Settings2 className="h-4 w-4" aria-hidden="true" /> },
    ...(showAdmin
      ? [
          {
            id: "admin" as const,
            label: "Admin",
            testId: "tab-admin",
            icon: <Users className="h-4 w-4" aria-hidden="true" />
          }
        ]
      : [])
  ];

  const renderBrokerCard = (): ReactElement => (
    <BrokerConnectionCard
      accounts={brokerAccounts.data ?? []}
      portfolio={primaryPortfolio ?? null}
      apiKey={alpacaApiKey}
      secret={alpacaSecret}
      onApiKeyChange={setAlpacaApiKey}
      onSecretChange={setAlpacaSecret}
      onConnect={() => connectBrokerMutation.mutate()}
      connecting={connectBrokerMutation.isPending}
      onReconnect={() => {
        void invalidateTradingData();
        if (alpacaConnected) {
          goAutonomousMutation.mutate();
        }
      }}
    />
  );

  const renderRiskRulesForm = (): ReactElement => (
    <Panel title="Risk Control Matrix" icon={<SlidersHorizontal className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
      {risk.data ? (
        <form
          key={risk.data.updatedAt}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            updateRiskMutation.mutate({
              maxRiskPerTradePercent: Number(formData.get("maxRiskPerTradePercent")),
              maxDailyLossPercent: Number(formData.get("maxDailyLossPercent")),
              maxDrawdownPercent: Number(formData.get("maxDrawdownPercent")),
              maxPositionSizePercent: Number(formData.get("maxPositionSizePercent")),
              stopTrading: formData.get("stopTrading") === "on"
            });
          }}
        >
          <RiskInput name="maxRiskPerTradePercent" label="Risk per trade %" value={risk.data.maxRiskPerTradePercent} max={2} />
          <RiskInput name="maxPositionSizePercent" label="Max position %" value={risk.data.maxPositionSizePercent} />
          <RiskInput name="maxDailyLossPercent" label="Daily loss limit %" value={risk.data.maxDailyLossPercent} />
          <RiskInput name="maxDrawdownPercent" label="Max drawdown %" value={risk.data.maxDrawdownPercent} />
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-surface px-3 py-3 text-sm text-slate-200 sm:col-span-2">
            <input name="stopTrading" type="checkbox" defaultChecked={risk.data.stopTrading} className="h-4 w-4 accent-rose-500" />
            Stop all trading
          </label>
          <button data-testid="save-risk-rules" type="submit" className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 sm:col-span-2">
            <Save className="h-4 w-4" aria-hidden="true" />
            Save Risk Rules
          </button>
        </form>
      ) : (
        <EmptyLine text="Risk rules are loading" />
      )}
    </Panel>
  );

  const renderAlertPreferences = (): ReactElement => (
    <Panel title="Alert Routing" icon={<AlertTriangle className="h-5 w-5 text-caution" aria-hidden="true" />}>
      <form
        key={JSON.stringify(profile.data?.notificationPreferences ?? user?.notificationPreferences)}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          updatePreferencesMutation.mutate({
            trade: formData.get("trade") === "on",
            signal: formData.get("signal") === "on",
            risk: formData.get("risk") === "on",
            system: formData.get("system") === "on"
          });
        }}
      >
        {(["trade", "signal", "risk", "system"] as const).map((preference) => (
          <label key={preference} className="flex min-h-11 items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm capitalize text-slate-200">
            {preference} alerts
            <input
              name={preference}
              type="checkbox"
              defaultChecked={(profile.data?.notificationPreferences ?? user?.notificationPreferences)?.[preference] ?? true}
              className="h-4 w-4 accent-violet-500"
            />
          </label>
        ))}
        <button data-testid="save-alert-preferences" type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm text-white">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save Alert Preferences
        </button>
      </form>
    </Panel>
  );

  const renderMfaPanel = (): ReactElement => (
    <Panel title="Account Security" icon={<Lock className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
      <div className="space-y-3">
        <div className="flex min-h-11 items-center justify-between rounded-md border border-line bg-surface px-3 py-3 text-sm">
          <span className="text-slate-300">Authenticator MFA</span>
          <span
            data-testid="mfa-status"
            className={`font-mono text-xs ${profile.data?.mfaEnabled ? "text-emerald-300" : "text-slate-400"}`}
          >
            {profile.data?.mfaEnabled ? "ENABLED" : "DISABLED"}
          </span>
        </div>

        {!profile.data?.mfaEnabled && !mfaSetup ? (
          <button
            data-testid="setup-mfa"
            type="button"
            onClick={() => setupMfaMutation.mutate()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm text-white"
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            Set Up Authenticator
          </button>
        ) : null}

        {mfaSetup ? (
          <div data-testid="mfa-setup" className="space-y-3 rounded-md border border-violet-400/30 bg-violet-400/5 p-3">
            <label className="block text-xs uppercase text-slate-400">
              Setup secret
              <input
                readOnly
                value={mfaSetup.secret}
                className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <a
              href={mfaSetup.otpAuthUri}
              className="block min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-center text-sm text-slate-200"
            >
              Open Authenticator
            </a>
          </div>
        ) : null}

        {mfaSetup || profile.data?.mfaEnabled ? (
          <>
            <label className="block text-sm text-slate-300">
              Authenticator code
              <input
                data-testid="mfa-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white"
              />
            </label>
            <button
              data-testid={profile.data?.mfaEnabled ? "disable-mfa" : "enable-mfa"}
              type="button"
              onClick={() =>
                profile.data?.mfaEnabled
                  ? disableMfaMutation.mutate()
                  : enableMfaMutation.mutate()
              }
              className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm ${
                profile.data?.mfaEnabled
                  ? "border border-rose-400/40 bg-rose-400/10 text-rose-200"
                  : "bg-emerald-500 text-slate-950"
              }`}
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              {profile.data?.mfaEnabled ? "Disable MFA" : "Enable MFA"}
            </button>
          </>
        ) : null}
      </div>
    </Panel>
  );

  const renderNotificationsPanel = (): ReactElement => (
    <Panel title="Notifications" icon={<ClipboardList className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
      <div className="space-y-2">
        {(notifications.data ?? []).slice(-6).reverse().map((notification) => (
          <div key={notification.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm">
            <span className="text-slate-200">{notification.title}</span>
            <span className="font-mono text-xs text-slate-400">{notification.status}</span>
          </div>
        ))}
        {(notifications.data ?? []).length === 0 ? <EmptyLine text="No notifications yet" /> : null}
      </div>
      <button type="button" onClick={() => markNotificationsReadMutation.mutate()} className="mt-3 min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-slate-200">
        Mark all read
      </button>
    </Panel>
  );

  const renderPositions = (): ReactElement => {
    const rows = Array.from(
      new Map((positions.data ?? []).map((position) => [position.symbol.toUpperCase(), position])).values()
    );
    return (
    <Panel title="Positions" icon={<Activity className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
      <div data-testid="positions-list" className="space-y-2">
        {rows.length === 0 ? (
          <EmptyLine text="No open paper positions" />
        ) : (
          rows.map((position) => (
            <div key={`${position.symbol}-${position.assetId ?? position.id}`} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm sm:grid-cols-4">
              <span className="font-mono text-white">{position.symbol}</span>
              <span>{formatQty(position.quantity)}</span>
              <span className="sm:text-right">{formatCurrency(position.averagePrice, { microDetail: true })}</span>
              <span
                className={`text-right ${position.unrealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                title={formatCurrencyTooltip(position.unrealizedPnl)}
                data-testid={`position-upnl-${position.symbol}`}
              >
                {formatCurrency(position.unrealizedPnl, { microDetail: true })}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
    );
  };

  const renderTradeHistory = (): ReactElement => (
    <Panel title="Trade History" icon={<History className="h-5 w-5 text-amber-300" aria-hidden="true" />}>
      <div data-testid="trade-history" className="space-y-2">
        {(trades.data ?? []).length === 0 ? (
          <EmptyLine text={alpacaConnected ? "No Alpaca trades yet" : "No trades yet"} />
        ) : (
          trades.data?.slice(-8).reverse().map((trade) => (
            <div key={trade.id} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm sm:grid-cols-5">
              <span className="font-mono text-white">{trade.symbol}</span>
              <span>{trade.side}</span>
              <span>
                {formatQty(trade.quantity)} @ {formatCurrency(trade.entryPrice)}
              </span>
              <span className="sm:text-right">{formatCurrency(trade.quantity * trade.entryPrice)}</span>
              <span className={`text-right ${trade.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {trade.closedAt ? formatCurrency(trade.pnl) : "Open"}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );

  const renderAnalytics = (): ReactElement => {
    const empty = Boolean(insufficientHistoryLabel(closedTradeCount));
    return (
      <Panel title="Portfolio Analytics" icon={<LineChart className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
        <details open={closedTradeCount >= 5} className="group">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-200">
            <span>Sharpe, Sortino, drawdown, and trade quality</span>
            <span className="text-xs text-slate-500">{closedTradeCount} closed trades</span>
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SmallStat label="Profit Factor" value={analyticsValue(closedTradeCount, analytics.data?.profitFactor)} empty={empty} />
            <SmallStat label="Sharpe Ratio" value={analyticsValue(closedTradeCount, analytics.data?.sharpeRatio)} empty={empty} />
            <SmallStat label="Sortino Ratio" value={analyticsValue(closedTradeCount, analytics.data?.sortinoRatio)} empty={empty} />
            <SmallStat label="Total Return" value={analyticsValue(closedTradeCount, analytics.data?.totalReturn, formatPercent)} empty={empty} />
            <SmallStat label="Average Trade" value={analyticsValue(closedTradeCount, analytics.data?.averageTrade, formatCurrency)} empty={empty} />
            <SmallStat label="Risk / Reward" value={analyticsValue(closedTradeCount, analytics.data?.riskRewardRatio)} empty={empty} />
          </div>
        </details>
      </Panel>
    );
  };

  const renderManualOrderForm = (): ReactElement => (
    <Panel title="Advanced Manual Order Ticket" icon={<ClipboardList className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
      <details open className="space-y-3">
        <summary className="mb-3 flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-200">
          Manual order controls
          <span className="text-xs text-slate-500">Visible for e2e and operator override</span>
        </summary>
        <form
          data-testid="manual-order-form"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const side = String(formData.get("side") ?? "BUY") as OrderSide;
            const orderType = String(formData.get("orderType") ?? "MARKET") as OrderType;
            const referencePrice = Number(formData.get("price"));
            const livePrice = marketQuote.data?.price;
            const entryPrice =
              orderType === "MARKET" && livePrice && livePrice > 0 ? livePrice : referencePrice;
            let stopLoss = Number(formData.get("stopLoss"));
            let takeProfit = Number(formData.get("takeProfit"));
            if (orderType === "MARKET" && entryPrice > 0) {
              if (side === "BUY") {
                if (!(stopLoss < entryPrice)) {
                  stopLoss = Number((entryPrice * 0.98).toFixed(2));
                }
                if (!(takeProfit > entryPrice)) {
                  takeProfit = Number((entryPrice * 1.05).toFixed(2));
                }
              } else {
                if (!(stopLoss > entryPrice)) {
                  stopLoss = Number((entryPrice * 1.02).toFixed(2));
                }
                if (!(takeProfit < entryPrice)) {
                  takeProfit = Number((entryPrice * 0.95).toFixed(2));
                }
              }
            }
            manualTradeMutation.mutate({
              symbol: String(formData.get("symbol") ?? "AAPL").toUpperCase(),
              side,
              orderType,
              quantity: Number(formData.get("quantity")),
              price: Number(entryPrice.toFixed(2)),
              stopLoss,
              takeProfit
            });
          }}
        >
          <label className="text-sm text-slate-300">
            Symbol
            <input name="symbol" defaultValue={symbol} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white" />
          </label>
          <label className="text-sm text-slate-300">
            Side
            <select name="side" defaultValue="BUY" className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white">
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Order type
            <select name="orderType" defaultValue="MARKET" className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white">
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="STOP">Stop</option>
            </select>
          </label>
          <ManualTradeInput name="quantity" label="Quantity" value={orderDraft?.quantity ?? currentOrderDraft?.quantity ?? 1} step="0.0001" />
          <ManualTradeInput name="price" label="Reference price" value={marketQuote.data?.price ?? currentOrderDraft?.price ?? 200} step="0.01" />
          <ManualTradeInput name="stopLoss" label="Stop loss" value={currentOrderDraft?.stopLoss ?? 196} step="0.01" />
          <ManualTradeInput name="takeProfit" label="Take profit" value={currentOrderDraft?.takeProfit ?? 210} step="0.01" />
          <button
            data-testid="execute-manual-trade"
            type="submit"
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Submit Manual Order
          </button>
        </form>
      </details>
    </Panel>
  );

  const renderPaperDiagnostics = (): ReactElement => (
    <Panel title="Paper Trading Diagnostics" icon={<CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
      <div className={`grid gap-3 ${showDevDiagnostics ? "md:grid-cols-2" : ""}`}>
        <button
          data-testid="execute-paper-trade"
          type="button"
          onClick={() => executeTradeMutation.mutate(orderDraft ?? currentOrderDraft ?? undefined)}
          className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Execute Paper Trade
        </button>
        {showDevDiagnostics ? (
          <button
            data-testid="execute-invalid-trade"
            type="button"
            onClick={() => invalidTradeMutation.mutate()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-rose-500 px-4 py-3 text-sm font-medium text-white"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Test Risk Block
          </button>
        ) : null}
      </div>
      <div className="mt-3 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
        Paper orders tracked: <span className="font-mono text-white">{orders.data?.length ?? 0}</span>
      </div>
      {riskNotice ? (
        <p data-testid="risk-block-message" className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {riskNotice}
        </p>
      ) : null}
      <div className="mt-3">
        <RiskResultBanner result={riskResult} onApplySuggestedQuantity={applySuggestedQuantity} />
      </div>
    </Panel>
  );

  if (!authenticated) {
    return (
      <LandingPage
        loginEmail={loginEmail}
        loginPassword={loginPassword}
        loginMfaCode={loginMfaCode}
        mfaChallenge={mfaChallenge}
        notice={notice}
        submitting={loginMutation.isPending}
        onLoginEmailChange={setLoginEmail}
        onLoginPasswordChange={setLoginPassword}
        onLoginMfaCodeChange={setLoginMfaCode}
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          loginMutation.mutate();
        }}
      />
    );
  }

  const officeBusy =
    activateDondieMutation.isPending ||
    pauseDondieMutation.isPending ||
    resumeDondieMutation.isPending ||
    runDondieMutation.isPending;

  if (activeTab === "home") {
    return (
      <main className="h-dvh overflow-hidden px-2 pt-2 pb-20 md:px-3 md:pb-2">
        <h1 data-testid="dashboard-title" className="sr-only">
          Dondie Agent Office
        </h1>
        {notice ? (
          <div
            data-testid="workflow-notice"
            className="mb-2 flex flex-col gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 font-mono text-xs text-emerald-100 sm:flex-row sm:items-center sm:justify-between"
          >
            <p>{notice}</p>
            {brokerSetupNotice && !alpacaConnected ? (
              <button
                type="button"
                data-testid="notice-connect-alpaca"
                onClick={openBrokerConnection}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-slate-950"
              >
                Enter Alpaca keys
              </button>
            ) : null}
          </div>
        ) : null}
        <section data-testid="home-view" className="flex h-full min-h-0 flex-col gap-1">
          <div className="hidden shrink-0 md:block [&_nav]:mb-0">
            <DesktopNav activeTab={activeTab} onChange={openControlRoomTab} tabs={desktopTabs} />
          </div>
          <div className="min-h-0 flex-1">
            <OfficeConsole
              agent={dondieAgent.data ?? null}
              lifestyle={dondieLifestyle.data ?? null}
              automation={automationSettings.data ?? null}
              lastAutomationRun={automationRunResult}
              signals={signals.data ?? []}
              orders={orders.data ?? []}
              trades={trades.data ?? []}
              positions={positions.data ?? []}
              portfolio={primaryPortfolio ?? null}
              risk={risk.data ?? null}
              brokers={brokerAccounts.data ?? []}
              memories={dondieMemories.data ?? []}
              realtimeConnected={realtimeConnected}
              loading={dondieLifestyle.isLoading || dondieAgent.isLoading}
              fetchError={dondieLifestyle.isError && dondieAgent.isError}
              userEmail={user?.email ?? ""}
              onLogout={() => logoutMutation.mutate()}
              onActivate={() => activateDondieMutation.mutate()}
              onPause={() => pauseDondieMutation.mutate()}
              onResume={() => resumeDondieMutation.mutate()}
              onRun={() => runDondieMutation.mutate()}
              onOpenTab={openControlRoomTab}
              canActivate
              busy={officeBusy || goAutonomousMutation.isPending}
            />
          </div>
        </section>
        <BottomNav activeTab={activeTab} onChange={openControlRoomTab} showAdmin={showAdmin} />
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen overflow-x-hidden px-4 py-5 md:px-6 md:pb-5 ${
        activeTab === "live" ||
        activeTab === "market" ||
        activeTab === "strategies" ||
        activeTab === "risk" ||
        activeTab === "lab" ||
        activeTab === "admin"
          ? "pb-32"
          : "pb-24"
      }`}
    >
      <header className="mb-5 flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">Dondie Ops</p>
          <h1 data-testid="dashboard-title" className="truncate text-lg font-semibold text-white">
            Control Room
          </h1>
        </div>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          className="flex min-h-11 items-center gap-2 self-start rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs uppercase tracking-wide text-slate-300"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Logout
        </button>
      </header>

      {notice ? (
        <div
          data-testid="workflow-notice"
          className="mb-4 flex flex-col gap-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{notice}</p>
          {brokerSetupNotice && !alpacaConnected ? (
            <button
              type="button"
              data-testid="notice-connect-alpaca"
              onClick={openBrokerConnection}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950"
            >
              Enter Alpaca keys
            </button>
          ) : null}
        </div>
      ) : null}

      <DesktopNav activeTab={activeTab} onChange={openControlRoomTab} tabs={desktopTabs} />

      {activeTab === "signals" ? (
        <section data-testid="signals-view" className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Generate Signal" icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
            <div className="grid gap-3">
              <label className="text-sm text-slate-300">
                Symbol
                <input
                  data-testid="signal-symbol"
                  aria-label="Signal symbol"
                  className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-3 font-mono text-sm text-white outline-none focus:border-violetSignal"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                />
              </label>
              <label className="text-sm text-slate-300">
                Strategy
                <select
                  className="mt-2 min-h-11 w-full rounded-md border border-line bg-surface px-3 py-3 text-sm text-white"
                  value={selectedStrategy?.id ?? ""}
                  onChange={(event) => setSelectedStrategyId(event.target.value)}
                >
                  {(strategies.data ?? []).length === 0 ? <option value="">Create a strategy first</option> : null}
                  {(strategies.data ?? []).map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name} ({strategy.status})
                    </option>
                  ))}
                </select>
              </label>
              <button
                data-testid="generate-signal"
                type="button"
                onClick={() => generateSignalMutation.mutate()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm font-medium text-white"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Generate Signal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("trade")}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm text-slate-200"
              >
                Open AI Trade Copilot
              </button>
              <div data-testid="latest-signal" className="rounded-md border border-line bg-white/5 px-4 py-3 text-sm text-slate-200">
                {latestSignal
                  ? `${latestSignal.signalType} ${latestSignal.symbol} confidence ${latestSignal.confidenceScore}%`
                  : "No signal yet"}
              </div>
            </div>
          </Panel>

          <Panel title="Signal History" icon={<History className="h-5 w-5 text-amber-300" aria-hidden="true" />}>
            <div data-testid="signal-history" className="space-y-2">
              {(signals.data ?? []).length === 0 ? (
                <EmptyLine text="No AI signals generated yet" />
              ) : (
                signals.data?.slice().reverse().map((signal) => (
                  <div key={signal.id} className="grid gap-2 rounded-lg border border-line bg-surface px-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto]">
                    <div>
                      <p className="font-mono text-white">{signal.symbol}</p>
                      <p className="text-xs text-slate-500">{new Date(signal.generatedAt).toLocaleString()}</p>
                    </div>
                    <StatusPill label={signal.signalType} tone={signal.signalType === "BUY" ? "emerald" : signal.signalType === "SELL" ? "rose" : "slate"} />
                    <span className="font-mono text-slate-200">{signal.confidenceScore}%</span>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </section>
      ) : null}

      {activeTab === "trade" ? (
        <section data-testid="trade-view" className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <AITradeCopilot
              symbol={symbol}
              onSymbolChange={setSymbol}
              timeframeLabel={timeframe}
              quote={marketQuote.data ?? null}
              quoteLoading={marketQuote.isLoading}
              strategies={strategies.data ?? []}
              selectedStrategyId={selectedStrategy?.id ?? ""}
              onStrategyChange={setSelectedStrategyId}
              latestSignal={latestSignal ?? null}
              portfolio={primaryPortfolio ?? null}
              risk={risk.data ?? null}
              automationMode={automationSettings.data?.mode ?? "ASSISTED"}
              brokerConnected={brokerConnected}
              analyzing={generateSignalMutation.isPending}
              submitting={executeTradeMutation.isPending}
              riskResult={riskResult}
              riskPassed={riskPassed}
              onAnalyze={() => generateSignalMutation.mutate()}
              onApprovePaperTrade={(draft) => executeTradeMutation.mutate(draft)}
              onApplySuggestedQuantity={applySuggestedQuantity}
              draftOverride={orderDraft}
              onDraftChange={(draft) => setOrderDraft(normalizeDraftCalculations(draft))}
              agent={dondieAgent.data ?? null}
              memories={dondieMemories.data ?? []}
              onRunAgent={() => runDondieMutation.mutate()}
              agentBusy={runDondieMutation.isPending || goAutonomousMutation.isPending}
            />
            {automationSettings.data?.mode !== "AUTOPILOT" ? (
              <div
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-50"
                data-testid="trade-hands-off-cta"
              >
                <p className="font-medium">Do not want to pick symbols?</p>
                <p className="mt-1 text-cyan-100/80">
                  Start hands-off mode — Dondie chooses tickers and strategy, then trades on AUTOPILOT.
                </p>
                <button
                  type="button"
                  data-testid="trade-start-hands-off"
                  disabled={goAutonomousMutation.isPending}
                  onClick={() => goAutonomousMutation.mutate()}
                  className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
                >
                  Start hands-off (no symbols needed)
                </button>
              </div>
            ) : null}
            {automationSettings.data?.mode === "AUTOPILOT" ? null : renderManualOrderForm()}
          </div>
          <div className="space-y-5">
            {automationSettings.data?.mode === "AUTOPILOT" ? (
              <Panel title="Hands-off controls" icon={<Shield className="h-5 w-5 text-rose-300" aria-hidden="true" />} compact>
                <p className="mb-3 text-sm text-slate-400">
                  Mode stays on AUTOPILOT on the server — you can close this tab. Use emergency stop
                  only if you need the agent to halt.
                </p>
                <button
                  type="button"
                  data-testid="trade-emergency-stop"
                  onClick={() => emergencyPauseMutation.mutate()}
                  disabled={emergencyPauseMutation.isPending}
                  className="flex min-h-11 w-full items-center justify-center rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 disabled:opacity-40"
                >
                  Emergency stop
                </button>
              </Panel>
            ) : (
              <AutomationModesPanel
                settings={automationSettings.data ?? null}
                runResult={automationRunResult}
                running={automatedRunMutation.isPending}
                onModeChange={(mode: AutomationMode) => updateAutomationSettingsMutation.mutate({ mode, emergencyStop: false })}
                onEmergencyPause={() => emergencyPauseMutation.mutate()}
                onRun={() => automatedRunMutation.mutate()}
                onSettingsPatch={(patch) => updateAutomationSettingsMutation.mutate(patch)}
              />
            )}
            {automationSettings.data?.mode === "AUTOPILOT" ? null : renderPaperDiagnostics()}
          </div>
        </section>
      ) : null}

      {activeTab === "live" ? (
        <section data-testid="live-view" className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-panel/90 px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                data-testid="live-connection-dot"
                className={`h-2.5 w-2.5 rounded-full ${realtimeConnected ? "bg-emerald-400" : "bg-rose-400"}`}
                aria-hidden="true"
              />
              <StatusPill
                label={realtimeConnected ? "LIVE" : "DISCONNECTED"}
                tone={realtimeConnected ? "emerald" : "rose"}
              />
              <span className="text-xs text-slate-500">
                {schedulerStatus.data?.tradingEnvironment ?? "PAPER"} · {schedulerStatus.data?.status ?? "UNKNOWN"}
              </span>
            </div>
            <span className="font-mono text-xs text-slate-500">
              Every qualifying breakout, any day — no NFP-only window
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<WalletCards />}
              label="Equity"
              value={formatCurrency(primaryPortfolio?.portfolioValue, { microDetail: true })}
              tone="emerald"
            />
            <MetricCard
              icon={<LineChart />}
              label="Unrealized P&L"
              value={formatCurrency(primaryPortfolio?.unrealizedPnl, { microDetail: true })}
              tone={((primaryPortfolio?.unrealizedPnl ?? 0) >= 0 ? "emerald" : "rose")}
            />
            <MetricCard
              icon={<DollarSign />}
              label="Realized P&L"
              value={formatCurrency(primaryPortfolio?.realizedPnl, { microDetail: true })}
              tone={((primaryPortfolio?.realizedPnl ?? 0) >= 0 ? "emerald" : "rose")}
            />
            <MetricCard
              icon={<BriefcaseBusiness />}
              label="Open Positions"
              value={String(
                new Map((positions.data ?? []).map((position) => [position.symbol.toUpperCase(), position])).size
              )}
              tone="cyan"
            />
          </div>

          <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              {renderPositions()}
              <Panel title="Open Orders" icon={<ClipboardList className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
                <div data-testid="live-open-orders" className="space-y-2">
                  {(orders.data ?? []).filter(
                    (order) => order.status === "PENDING" || order.status === "SUBMITTED" || order.status === "PARTIALLY_FILLED"
                  ).length === 0 ? (
                    <EmptyLine text="No working orders right now" />
                  ) : (
                    (orders.data ?? [])
                      .filter((order) => order.status === "PENDING" || order.status === "SUBMITTED" || order.status === "PARTIALLY_FILLED")
                      .map((order) => (
                        <div
                          key={order.id}
                          className="grid grid-cols-2 gap-2 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm sm:grid-cols-4"
                        >
                          <span className="font-mono text-white">{order.symbol}</span>
                          <span>{order.side}</span>
                          <span>{formatQty(order.quantity)} @ {formatCurrency(order.price)}</span>
                          <StatusPill label={order.status} tone="amber" />
                        </div>
                      ))
                  )}
                </div>
              </Panel>
            </div>
            <Panel title="Live Activity Feed" icon={<Radio className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
              <ul data-testid="live-activity-feed" className="max-h-[32rem] space-y-2 overflow-y-auto text-sm">
                {liveFeed.length === 0 ? (
                  <EmptyLine text="Waiting for the next signal, order, or fill — this updates the instant it happens." />
                ) : (
                  liveFeed.map((item) => (
                    <li
                      key={item.id}
                      data-testid="live-feed-item"
                      className="rounded-md border border-line bg-white/[0.03] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-500">
                          {new Date(item.at).toLocaleTimeString(undefined, { hour12: false })}
                        </span>
                        <StatusPill label={item.kind} tone={item.tone} />
                      </div>
                      <p className="mt-1 text-slate-100">{item.headline}</p>
                      <p className="text-xs text-slate-400">{item.detail}</p>
                    </li>
                  ))
                )}
              </ul>
            </Panel>
          </section>
        </section>
      ) : null}

      {activeTab === "portfolio" ? (
        <section data-testid="portfolio-view" className="space-y-5">
          {automationSettings.data && (automationSettings.data.mode !== "AUTOPILOT" || automationSettings.data.emergencyStop) ? (
            <div
              data-testid="automation-paused-banner"
              className="flex flex-col gap-3 rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  <strong>Nothing is trading.</strong>{" "}
                  {automationSettings.data.emergencyStop
                    ? "Emergency stop is active"
                    : `Automation mode is ${automationSettings.data.mode}`}{" "}
                  — Dondie will not scan or place orders until Autopilot is resumed.
                </p>
              </div>
              <button
                type="button"
                data-testid="resume-autopilot"
                disabled={updateAutomationSettingsMutation.isPending}
                onClick={() => updateAutomationSettingsMutation.mutate({ mode: "AUTOPILOT", emergencyStop: false })}
                className="flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Resume Autopilot
              </button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<DollarSign />} label="Broker Cash" value={formatCurrency(primaryPortfolio?.cashBalance, { microDetail: true })} tone="violet" />
            <MetricCard
              icon={<WalletCards />}
              label="Capital Deployed"
              value={formatCurrency(
                primaryPortfolio?.capitalDeployed ??
                  Math.max(
                    0,
                    (primaryPortfolio?.portfolioValue ?? 0) - (primaryPortfolio?.cashBalance ?? 0) - (primaryPortfolio?.unrealizedPnl ?? 0)
                  ),
                { microDetail: true }
              )}
              tone="cyan"
            />
            <MetricCard
              icon={<LineChart />}
              label="Broker Realized P&L"
              value={formatCurrency(primaryPortfolio?.realizedPnl, { microDetail: true })}
              tone="emerald"
            />
            <MetricCard
              icon={<Bot />}
              label="Unrealized P&L"
              value={formatCurrency(primaryPortfolio?.unrealizedPnl, { microDetail: true })}
              tone="violet"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<WalletCards />}
              label="Equity"
              value={formatCurrency(primaryPortfolio?.portfolioValue, { microDetail: true })}
              tone="emerald"
            />
            <MetricCard
              icon={<Bot />}
              label="Survival Wallet"
              value={formatCurrency(dondieWallet.data?.balance ?? dondieAgent.data?.walletBalance ?? 0)}
              tone="cyan"
            />
            <MetricCard
              icon={<Bot />}
              label="Brain Tier"
              value={dondieWallet.data?.tier ?? dondieAgent.data?.tier ?? "—"}
              tone="cyan"
            />
            <MetricCard
              icon={<Activity />}
              label="Scheduler"
              value={schedulerStatus.data?.status ?? "…"}
              tone={schedulerStatus.data?.status === "RUNNING" ? "emerald" : "violet"}
            />
          </div>
          {(() => {
            const cash = primaryPortfolio?.cashBalance ?? 0;
            const deployed =
              primaryPortfolio?.capitalDeployed ??
              Math.max(0, (primaryPortfolio?.portfolioValue ?? 0) - cash - (primaryPortfolio?.unrealizedPnl ?? 0));
            const equity = primaryPortfolio?.portfolioValue ?? 0;
            const survival = dondieWallet.data?.balance ?? dondieAgent.data?.walletBalance ?? 0;
            if (deployed > 0.5 && cash < 1) {
              return (
                <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" data-testid="micro-stake-notice">
                  Micro account state: <strong>cash {formatCurrency(cash, { microDetail: true })}</strong> remains free,
                  while <strong>{formatCurrency(deployed, { microDetail: true })}</strong> is invested (capital deployed),
                  not profit. Equity {formatCurrency(equity, { microDetail: true })} · survival wallet{" "}
                  {formatCurrency(survival)} · realized {formatCurrency(primaryPortfolio?.realizedPnl ?? 0, { microDetail: true })} ·
                  unrealized {formatCurrency(primaryPortfolio?.unrealizedPnl ?? 0, { microDetail: true })}.
                </p>
              );
            }
            if (cash > 0 && cash <= 50 && deployed < 0.5) {
              return (
                <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" data-testid="micro-stake-notice">
                  Micro stake mode: broker cash is {formatCurrency(cash, { microDetail: true })} and mostly still free to deploy.
                  Survival wallet {formatCurrency(survival)} is separate cognition balance — not Alpaca buying power.
                </p>
              );
            }
            return null;
          })()}
          <Panel title="Scheduler status" icon={<Activity className="h-5 w-5 text-emerald-300" aria-hidden="true" />} compact>
            <div className="grid gap-2 text-sm sm:grid-cols-2" data-testid="scheduler-status-panel">
              <p>Status: <span className="font-mono text-white">{schedulerStatus.data?.status ?? "UNKNOWN"}</span></p>
              <p>Worker: <span className="font-mono text-white">{schedulerStatus.data?.workerId ?? "—"}</span></p>
              <p>Last scheduled: <span className="font-mono text-white">{schedulerStatus.data?.lastScheduledScanAt ? new Date(schedulerStatus.data.lastScheduledScanAt).toLocaleString() : "—"}</span></p>
              <p>Last manual: <span className="font-mono text-white">{schedulerStatus.data?.lastManualScanAt ? new Date(schedulerStatus.data.lastManualScanAt).toLocaleString() : "—"}</span></p>
              <p>Next expected: <span className="font-mono text-white" data-testid="next-scheduled-scan">{schedulerStatus.data?.nextExpectedScanAt ? new Date(schedulerStatus.data.nextExpectedScanAt).toLocaleString() : "—"}</span></p>
              <p>Env: <span className="font-mono text-white">{schedulerStatus.data?.tradingEnvironment ?? "PAPER"}</span></p>
              <p>Symbols evaluated: <span className="font-mono text-white">{schedulerStatus.data?.lastSymbolsEvaluated ?? 0}</span></p>
              <p>Orders filled: <span className="font-mono text-white">{schedulerStatus.data?.lastOrdersFilled ?? 0}</span></p>
            </div>
            {schedulerStatus.data?.status === "STOPPED" || schedulerStatus.data?.status === "DELAYED" ? (
              <p className="mt-2 text-sm text-amber-200" data-testid="scheduler-warning">
                Scheduler {schedulerStatus.data.status}: automatic scans may be waiting on the free-tier wake path.
                Force scan remains optional; cron keepalive should resume scheduled runs.
              </p>
            ) : null}
          </Panel>
          <Panel title="Trade activity timeline" icon={<History className="h-5 w-5 text-amber-300" aria-hidden="true" />}>
            <ul className="space-y-2 text-sm" data-testid="trade-activity-timeline">
              {(tradeActivities.data ?? []).length === 0 ? (
                <EmptyLine text="No scan activity yet — scheduled scans appear here after the server runs." />
              ) : (
                (tradeActivities.data ?? []).slice(0, 40).map((activity) => (
                  <li key={activity.id} className="rounded-md border border-line bg-white/[0.03] px-3 py-2">
                    <span className="font-mono text-xs text-slate-500">
                      {new Date(activity.occurredAt).toLocaleTimeString(undefined, { hour12: false })}
                    </span>{" "}
                    <span className="text-slate-100">{activity.headline}</span>
                    {activity.reasonCode ? (
                      <span className="ml-2 font-mono text-xs text-amber-200">{activity.reasonCode}</span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </Panel>
          <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              {renderPositions()}
              {renderTradeHistory()}
            </div>
            <div className="space-y-5">
              {renderAnalytics()}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "settings" ? (
        <section data-testid="settings-view" className="space-y-5">
          <HandsOffCapitalPanel
            alpacaConnected={alpacaConnected}
            brokerLoading={brokerAccounts.isLoading}
            agent={dondieAgent.data ?? null}
            automation={automationSettings.data ?? null}
            portfolio={primaryPortfolio ?? null}
            autonomy={lastAutonomy}
            onConnectBroker={openBrokerConnection}
            onGoAutonomous={() => goAutonomousMutation.mutate()}
            onEmergencyStop={() => emergencyPauseMutation.mutate()}
            busy={
              connectBrokerMutation.isPending ||
              goAutonomousMutation.isPending ||
              emergencyPauseMutation.isPending
            }
          />
          {renderBrokerCard()}
          <Panel title="More Control Room Views" icon={<Settings2 className="h-5 w-5 text-slate-300" aria-hidden="true" />} compact>
            <p className="mb-3 text-sm text-slate-400 md:hidden">
              Tap a view to open it. On phones these live here under Settings; desktop shows them in the top bar.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { id: "market" as const, label: "Market", testId: "tab-market" },
                { id: "strategies" as const, label: "Strategies", testId: "tab-strategies" },
                { id: "risk" as const, label: "Risk", testId: "tab-risk" },
                { id: "lab" as const, label: "Lab", testId: "tab-lab" },
                ...(showAdmin ? [{ id: "admin" as const, label: "Admin", testId: "tab-admin" }] : [])
              ].map((item) => (
                <button
                  key={item.id}
                  data-testid={item.testId}
                  type="button"
                  onClick={() => openControlRoomTab(item.id)}
                  className="relative z-10 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm text-slate-200 active:bg-white/10"
                >
                  <span>{item.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                </button>
              ))}
            </div>
          </Panel>
          <section className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-5">
              {renderRiskRulesForm()}
            </div>
            <div className="space-y-5">
              {renderMfaPanel()}
              {renderAlertPreferences()}
              {renderNotificationsPanel()}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "market" ? (
        <section data-testid="market-view" className="space-y-5">
          <Panel title="Market Data Console" icon={<LineChart className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
            <div className="grid gap-3 md:grid-cols-[180px_160px_1fr]">
              <label className="text-sm text-slate-300">
                Symbol
                <input
                  data-testid="market-symbol"
                  className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                />
              </label>
              <label className="text-sm text-slate-300">
                Timeframe
                <select
                  data-testid="market-timeframe"
                  className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
                  value={timeframe}
                  onChange={(event) => setTimeframe(event.target.value as MarketTimeframe)}
                >
                  {timeframes.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <div className="flex min-h-16 items-end justify-between gap-4 rounded-md border border-line bg-white/[0.03] px-4 py-3">
                <div>
                  <span className="text-sm text-slate-400">Live paper quote</span>
                  <span
                    data-testid="realtime-status"
                    className={`ml-2 font-mono text-[10px] uppercase ${
                      realtimeConnected ? "text-emerald-300" : "text-amber-300"
                    }`}
                  >
                    {realtimeConnected ? "WebSocket live" : "Polling fallback"}
                  </span>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {marketQuote.data
                      ? `${formatCurrency(marketQuote.data.bid)} / ${formatCurrency(marketQuote.data.ask)}`
                      : "Loading"}
                  </p>
                </div>
                <div className="text-right">
                  <span data-testid="market-latest-price" className="font-mono text-xl text-white">
                    {formatCurrency(marketQuote.data?.price ?? latestCandle?.close)}
                  </span>
                  <p className={`font-mono text-xs ${(marketQuote.data?.changePercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatPercent(marketQuote.data?.changePercent)}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <div className="min-w-0 space-y-5">
              <Panel title="Indicator Snapshot" icon={<Activity className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SmallStat label="SMA 20" value={formatIndicator(marketIndicators.data?.sma)} />
                  <SmallStat label="EMA 20" value={formatIndicator(marketIndicators.data?.ema)} />
                  <SmallStat label="RSI 14" value={formatIndicator(marketIndicators.data?.rsi)} />
                  <SmallStat label="ATR 14" value={formatIndicator(marketIndicators.data?.atr)} />
                  <SmallStat label="MACD" value={formatIndicator(marketIndicators.data?.macd.macd)} />
                  <SmallStat label="MACD Signal" value={formatIndicator(marketIndicators.data?.macd.signal)} />
                  <SmallStat label="Bollinger Upper" value={formatIndicator(marketIndicators.data?.bollingerBands.upper)} />
                  <SmallStat label="Volume SMA" value={formatIndicator(marketIndicators.data?.volume.sma, 0)} />
                </div>
              </Panel>

              <Panel title="Historical Prices" icon={<History className="h-5 w-5 text-amber-300" aria-hidden="true" />}>
                <div className="relative w-full max-w-full overflow-x-auto overscroll-x-contain">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Open</th>
                        <th className="px-3 py-2">High</th>
                        <th className="px-3 py-2">Low</th>
                        <th className="px-3 py-2">Close</th>
                        <th className="px-3 py-2">Volume</th>
                      </tr>
                    </thead>
                    <tbody data-testid="market-price-history">
                      {(marketPrices.data ?? []).slice(-10).reverse().map((candle) => (
                        <tr key={candle.timestamp} className="border-t border-line text-slate-200">
                          <td className="px-3 py-2 font-mono text-xs">{new Date(candle.timestamp).toLocaleString()}</td>
                          <td className="px-3 py-2">{candle.open.toFixed(2)}</td>
                          <td className="px-3 py-2">{candle.high.toFixed(2)}</td>
                          <td className="px-3 py-2">{candle.low.toFixed(2)}</td>
                          <td className="px-3 py-2 font-mono text-white">{candle.close.toFixed(2)}</td>
                          <td className="px-3 py-2">{candle.volume.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            <Panel title="Watchlist" icon={<ListFilter className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
              <div className="space-y-2">
                {(watchlists.data?.[0]?.symbols ?? []).map((watchSymbol) => (
                  <button
                    key={watchSymbol}
                    type="button"
                    onClick={() => setSymbol(watchSymbol)}
                    className="flex min-h-11 w-full items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-left"
                  >
                    <span className="font-mono text-white">{watchSymbol}</span>
                    <span className="text-xs text-slate-400">Load</span>
                  </button>
                ))}
              </div>
              <label className="mt-4 block text-sm text-slate-300">
                Symbols
                <input
                  data-testid="watchlist-symbols"
                  className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white"
                  value={watchlistInput}
                  onChange={(event) => setWatchlistInput(event.target.value)}
                />
              </label>
              <button
                data-testid="save-watchlist"
                type="button"
                onClick={() =>
                  updateWatchlistMutation.mutate(
                    watchlistInput
                      .split(",")
                      .map((value) => value.trim().toUpperCase())
                      .filter(Boolean)
                  )
                }
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-3 py-2 text-sm text-white"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Save Watchlist
              </button>
            </Panel>
          </div>
        </section>
      ) : null}

      {activeTab === "strategies" ? (
        <section data-testid="strategies-view" className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-5">
            <Panel title="Create Strategy" icon={<Plus className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
              <div className="grid gap-3 md:grid-cols-[1fr_190px_auto]">
                <input
                  data-testid="strategy-name"
                  aria-label="New strategy name"
                  className="min-h-11 rounded-md border border-line bg-surface px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
                  value={strategyName}
                  onChange={(event) => setStrategyName(event.target.value)}
                />
                <select
                  aria-label="Strategy template"
                  className="min-h-11 rounded-md border border-line bg-surface px-3 py-3 text-sm text-white"
                  value={strategyTemplateName}
                  onChange={(event) => setStrategyTemplateName(event.target.value as typeof strategyTemplateName)}
                >
                  {strategyTemplates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  data-testid="create-strategy"
                  type="button"
                  onClick={() => createStrategyMutation.mutate()}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {selectedTemplate.description} Timeframe: {selectedTemplate.timeframe}. Risk: {selectedTemplate.riskProfile}.
              </p>
              <p data-testid="strategy-status" className="mt-2 font-mono text-xs text-slate-400">
                {strategies.data?.length ?? 0} configured
              </p>
            </Panel>

          <Panel title="Strategy Registry" icon={<Bot className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
            <div className="space-y-2">
              {(strategies.data ?? []).map((strategy) => (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => setSelectedStrategyId(strategy.id)}
                  className={`min-h-11 w-full rounded-md border px-3 py-3 text-left ${
                    selectedStrategy?.id === strategy.id
                      ? "border-emerald-400 bg-emerald-400/10"
                      : "border-line bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{strategy.name}</span>
                    <span className={`text-xs ${strategy.status === "ACTIVE" ? "text-emerald-300" : "text-slate-400"}`}>
                      {strategy.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">v{strategy.version}</p>
                </button>
              ))}
              {(strategies.data ?? []).length === 0 ? <EmptyLine text="Create a strategy above to get started" /> : null}
            </div>
          </Panel>
          </div>

          <Panel title="Strategy Configuration" icon={<Settings2 className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
            {selectedStrategy ? (
              <form
                key={selectedStrategy.id}
                data-testid="strategy-edit-form"
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  updateStrategyMutation.mutate({
                    id: selectedStrategy.id,
                    body: {
                      name: String(formData.get("name") ?? selectedStrategy.name),
                      status: formData.get("status") === "ACTIVE" ? "ACTIVE" : "INACTIVE",
                      configuration: {
                        ...selectedStrategy.configuration,
                        confidenceThreshold: Number(formData.get("confidenceThreshold")),
                        stopLossPercent: Number(formData.get("stopLossPercent")),
                        takeProfitPercent: Number(formData.get("takeProfitPercent"))
                      }
                    }
                  });
                }}
              >
                <label className="text-sm text-slate-300 md:col-span-2">
                  Strategy name
                  <input name="name" defaultValue={selectedStrategy.name} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Confidence threshold
                  <input name="confidenceThreshold" type="number" min="0" max="100" defaultValue={featureNumber(selectedStrategy.configuration, "confidenceThreshold") ?? 60} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Status
                  <select name="status" defaultValue={selectedStrategy.status} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white">
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Stop loss %
                  <input name="stopLossPercent" type="number" min="0.01" step="0.01" defaultValue={featureNumber(selectedStrategy.configuration, "stopLossPercent") ?? 5} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Take profit %
                  <input name="takeProfitPercent" type="number" min="0.01" step="0.01" defaultValue={featureNumber(selectedStrategy.configuration, "takeProfitPercent") ?? 8} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white" />
                </label>
                <button data-testid="save-strategy" type="submit" className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 md:col-span-2">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save Strategy
                </button>
              </form>
            ) : (
              <EmptyLine text="Create a strategy on the Strategies tab to link the agent" />
            )}
          </Panel>
        </section>
      ) : null}

      {activeTab === "risk" ? (
        <section data-testid="risk-view" className="grid gap-5 xl:grid-cols-2">
          {renderBrokerCard()}
          {renderRiskRulesForm()}
          <div className="space-y-5">
            {renderAlertPreferences()}
            {renderNotificationsPanel()}
          </div>
          <div className="space-y-5">
            {renderMfaPanel()}
            {renderPaperDiagnostics()}
          </div>
        </section>
      ) : null}

      {activeTab === "lab" ? (
        <section data-testid="lab-view" className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <Panel title="Historical Simulation" icon={<FlaskConical className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  backtestMutation.mutate({
                    ...(selectedStrategy ? { strategyId: selectedStrategy.id } : {}),
                    symbol: String(formData.get("symbol") ?? symbol).toUpperCase(),
                    timeframe: String(formData.get("timeframe") ?? timeframe) as MarketTimeframe,
                    startingEquity: Number(formData.get("startingEquity")),
                    fastPeriod: Number(formData.get("fastPeriod")),
                    slowPeriod: Number(formData.get("slowPeriod")),
                    maxPositionPercent: Number(formData.get("maxPositionPercent")),
                    feePerTrade: Number(formData.get("feePerTrade")),
                    slippagePercent: Number(formData.get("slippagePercent"))
                  });
                }}
              >
                <label className="text-sm text-slate-300">
                  Symbol
                  <input name="symbol" defaultValue={symbol} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white" />
                </label>
                <label className="text-sm text-slate-300">
                  Timeframe
                  <select name="timeframe" defaultValue={timeframe} className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white">
                    {timeframes.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <LabInput
                  name="startingEquity"
                  label="Starting equity"
                  // Keep 2dp so HTML5 step validation cannot block submit when
                  // live portfolio equity is stored at 4dp after paper fills.
                  value={
                    primaryPortfolio?.portfolioValue && primaryPortfolio.portfolioValue > 0
                      ? Number(primaryPortfolio.portfolioValue.toFixed(2))
                      : 100_000
                  }
                  step="any"
                  min="1"
                />
                <LabInput name="maxPositionPercent" label="Max position %" value={20} step="any" />
                <LabInput name="fastPeriod" label="Fast period" value={10} step="any" />
                <LabInput name="slowPeriod" label="Slow period" value={20} step="any" />
                <LabInput name="feePerTrade" label="Fee per trade" value={1} step="any" />
                <LabInput name="slippagePercent" label="Slippage %" value={0.05} step="any" />
                <LabInput name="trainSize" label="Training candles" value={45} step="any" />
                <LabInput name="testSize" label="Test candles" value={20} step="any" />
                <button data-testid="run-backtest" type="submit" className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm text-white sm:col-span-2">
                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                  Run Backtest
                </button>
                <button
                  data-testid="run-walk-forward"
                  type="button"
                  className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 sm:col-span-2"
                  onClick={(event) => {
                    const form = event.currentTarget.form;
                    if (!form) {
                      return;
                    }
                    const formData = new FormData(form);
                    walkForwardMutation.mutate({
                      ...(selectedStrategy ? { strategyId: selectedStrategy.id } : {}),
                      symbol: String(formData.get("symbol") ?? symbol).toUpperCase(),
                      timeframe: String(formData.get("timeframe") ?? timeframe) as MarketTimeframe,
                      startingEquity: Number(formData.get("startingEquity")),
                      trainSize: Number(formData.get("trainSize")),
                      testSize: Number(formData.get("testSize")),
                      maxPositionPercent: Number(formData.get("maxPositionPercent")),
                      feePerTrade: Number(formData.get("feePerTrade")),
                      slippagePercent: Number(formData.get("slippagePercent"))
                    });
                  }}
                >
                  <LineChart className="h-4 w-4" aria-hidden="true" />
                  Run Walk-Forward
                </button>
              </form>
            </Panel>

            <Panel title="Performance Reports" icon={<Download className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => reportMutation.mutate("csv")} className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-3 text-sm text-slate-200">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export CSV
                </button>
                <button type="button" onClick={() => reportMutation.mutate("pdf")} className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-3 text-sm text-slate-200">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export PDF
                </button>
              </div>
            </Panel>
          </div>

          <Panel title="Backtest Results" icon={<BarChart3 className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
            {backtestResult ? (
              <div data-testid="backtest-result" className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SmallStat label="Ending Equity" value={formatCurrency(backtestResult.endingEquity)} />
                  <SmallStat label="Total Return" value={formatPercent(backtestResult.performance.totalReturn)} />
                  <SmallStat label="Closed Trades" value={String(backtestResult.totalTrades)} />
                  <SmallStat label="Max Drawdown" value={formatPercent(backtestResult.performance.maxDrawdown)} />
                </div>
                <EquityCurve values={backtestResult.performance.equityCurve} />
                <div className="max-h-80 overflow-auto">
                  {(backtestResult.trades ?? []).map((trade, index) => (
                    <div key={`${trade.openedAt}-${index}`} className="grid grid-cols-4 border-t border-line px-2 py-2 text-sm text-slate-300">
                      <span>{trade.symbol}</span>
                      <span>{trade.quantity.toFixed(2)}</span>
                      <span>{formatCurrency(trade.pnl)}</span>
                      <span className="text-right">{new Date(trade.closedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyLine text="Run a historical simulation to inspect performance" />
            )}
          </Panel>
          {walkForwardResult ? (
            <Panel title="Walk-Forward Results" icon={<LineChart className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
              <div data-testid="walk-forward-result" className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SmallStat label="Out-of-sample windows" value={String(walkForwardResult.windows.length)} />
                  <SmallStat label="Ending Equity" value={formatCurrency(walkForwardResult.endingEquity)} />
                  <SmallStat label="Sortino Ratio" value={String(walkForwardResult.performance.sortinoRatio)} />
                  <SmallStat label="Avg Trade" value={formatCurrency(walkForwardResult.performance.averageTrade)} />
                </div>
                <div className="max-h-80 space-y-2 overflow-auto">
                  {walkForwardResult.windows.map((window) => (
                    <div key={window.index} className="grid gap-2 rounded-md border border-line bg-surface px-3 py-3 text-sm sm:grid-cols-4">
                      <span>Window {window.index + 1}</span>
                      <span className="font-mono">EMA {window.selectedFastPeriod}/{window.selectedSlowPeriod}</span>
                      <span>{formatPercent(window.result.performance.totalReturn)}</span>
                      <span className="text-right">{window.result.totalTrades} trades</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ) : null}
        </section>
      ) : null}

      {activeTab === "admin" && showAdmin ? (
        <section data-testid="admin-view" className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SmallStat label="API" value={systemHealth.data?.api ?? "loading"} />
            <SmallStat label="Supabase" value={jsonText(systemHealth.data?.supabase, "status")} />
            <SmallStat label="Uptime" value={`${systemHealth.data?.uptimeSeconds ?? 0}s`} />
          </div>
          <div data-testid="operational-metrics" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SmallStat label="API Avg Latency" value={`${operationalMetrics.data?.api.averageLatencyMs ?? 0} ms`} />
            <SmallStat label="API P95 Latency" value={`${operationalMetrics.data?.api.p95LatencyMs ?? 0} ms`} />
            <SmallStat label="Error Rate" value={formatPercent(operationalMetrics.data?.api.errorRatePercent)} />
            <SmallStat label="Signal Throughput" value={`${operationalMetrics.data?.signals.throughputPerMinute ?? 0}/min`} />
            <SmallStat
              label="Queue Depth"
              value={
                operationalMetrics.data?.notificationQueue.depth === null
                  ? "Unavailable"
                  : String(operationalMetrics.data?.notificationQueue.depth ?? 0)
              }
            />
          </div>
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="User Administration" icon={<WalletCards className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
              <form
                data-testid="admin-create-user-form"
                className="mb-4 space-y-3 rounded-md border border-line bg-surface p-3"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  createAdminUserMutation.mutate();
                }}
              >
                <p className="text-sm font-medium text-white">Provision user (admin-set password)</p>
                <input
                  data-testid="admin-create-email"
                  className="min-h-11 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                  placeholder="Email"
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  autoComplete="off"
                />
                <input
                  data-testid="admin-create-password"
                  className="min-h-11 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                  placeholder="Temporary password"
                  type="password"
                  value={newUserPassword}
                  onChange={(event) => setNewUserPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="min-h-11 rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                    placeholder="First name"
                    value={newUserFirstName}
                    onChange={(event) => setNewUserFirstName(event.target.value)}
                  />
                  <input
                    className="min-h-11 rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                    placeholder="Last name"
                    value={newUserLastName}
                    onChange={(event) => setNewUserLastName(event.target.value)}
                  />
                </div>
                <button
                  data-testid="admin-create-submit"
                  type="submit"
                  className="min-h-11 w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950"
                >
                  Create user
                </button>
              </form>
              <div data-testid="admin-users" className="space-y-2">
                {(adminUsers.data ?? []).map((adminUser) => (
                  <div key={adminUser.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-white">{adminUser.email}</p>
                      <p className="text-xs text-slate-400">{adminUser.firstName} {adminUser.lastName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right font-mono text-xs">
                        <p className="text-slate-300">{adminUser.role}</p>
                        <p className={adminUser.status === "ACTIVE" ? "text-emerald-300" : "text-rose-300"}>
                          {adminUser.status}
                        </p>
                      </div>
                      {adminUser.id !== user?.id ? (
                        <button
                          type="button"
                          title={adminUser.status === "ACTIVE" ? "Suspend user" : "Reactivate user"}
                          onClick={() =>
                            updateAdminUserStatusMutation.mutate({
                              userId: adminUser.id,
                              status: adminUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"
                            })
                          }
                          className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-white/5 text-slate-200"
                        >
                          <Settings2 className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">
                            {adminUser.status === "ACTIVE" ? "Suspend user" : "Reactivate user"}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Admin Audit Logs" icon={<Users className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
              <label className="mb-3 block text-sm text-slate-300">
                Filter audit events
                <input
                  data-testid="audit-filter"
                  value={auditFilter}
                  onChange={(event) => setAuditFilter(event.target.value)}
                  className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white"
                  placeholder="TRADE_EXECUTED"
                />
              </label>
              <div data-testid="admin-audit-log" className="max-h-[520px] space-y-2 overflow-auto">
                {visibleAuditLogs.map((log) => (
                  <div key={log.id} className="grid gap-2 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-xs text-slate-300 md:grid-cols-[190px_1fr_1fr]">
                    <span className="font-mono text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                    <span className="font-mono text-white">{log.action}</span>
                    <span>{log.entityType}</span>
                  </div>
                ))}
                {visibleAuditLogs.length === 0 ? <EmptyLine text="No audit events match this filter" /> : null}
              </div>
            </Panel>
          </div>
        </section>
      ) : null}

      <BottomNav activeTab={activeTab} onChange={openControlRoomTab} showAdmin={showAdmin} />
    </main>
  );
}

function RiskInput({
  name,
  label,
  value,
  max = 100
}: {
  readonly name: string;
  readonly label: string;
  readonly value: number;
  readonly max?: number;
}): ReactElement {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <input
        name={name}
        type="number"
        min="0.01"
        max={max}
        step="0.01"
        defaultValue={value}
        className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
      />
    </label>
  );
}

function ManualTradeInput({
  name,
  label,
  value,
  step
}: {
  readonly name: string;
  readonly label: string;
  readonly value: number;
  readonly step: string;
}): ReactElement {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <input
        name={name}
        type="number"
        min={step}
        step={step}
        defaultValue={value}
        className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white"
      />
    </label>
  );
}

function LabInput({
  name,
  label,
  value,
  step = "any",
  min = "0"
}: {
  readonly name: string;
  readonly label: string;
  readonly value: number;
  readonly step?: string;
  readonly min?: string;
}): ReactElement {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <input
        name={name}
        type="number"
        min={min}
        step={step}
        defaultValue={value}
        className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-white"
      />
    </label>
  );
}

function EquityCurve({ values }: { readonly values: readonly number[] }): ReactElement {
  const visibleValues = values.slice(-40);
  const minimum = Math.min(...visibleValues);
  const maximum = Math.max(...visibleValues);
  const range = maximum - minimum || 1;

  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>Equity curve</span>
        <span>{formatCurrency(values[values.length - 1])}</span>
      </div>
      <div className="flex h-32 items-end gap-1" aria-label="Backtest equity curve">
        {visibleValues.map((value, index) => (
          <div
            key={`${index}-${value}`}
            className="min-w-1 flex-1 bg-emerald-400/80"
            style={{ height: `${Math.max(8, ((value - minimum) / range) * 100)}%` }}
            title={formatCurrency(value)}
          />
        ))}
      </div>
    </div>
  );
}
