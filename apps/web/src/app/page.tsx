"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardList,
  Download,
  DollarSign,
  FlaskConical,
  Gauge,
  History,
  LineChart,
  ListFilter,
  Lock,
  LogOut,
  Plus,
  Save,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
  WalletCards
} from "lucide-react";
import type { FormEvent, ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import type {
  AuditLog,
  AutomationRunResult,
  AuthTokens,
  BacktestResult,
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
  PerformanceSummary,
  PerformanceReport,
  BrokerAccountView,
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
import { ApiError, REALTIME_BASE_URL, apiFetch, apiFetchPage } from "../lib/api";
import { refreshSupabaseSession, signInWithSupabase, signOutSupabase } from "../lib/auth";
import { isSupabaseAuthEnabled } from "../lib/supabase/client";
import { useSessionStore } from "../store/session";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const formatCurrency = (value: number | undefined): string => currency.format(value ?? 0);
const formatPercent = (value: number | undefined): string => `${(value ?? 0).toFixed(2)}%`;

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

type TerminalTab = "overview" | "market" | "strategies" | "risk" | "lab" | "admin";

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

const timeframes: readonly MarketTimeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

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

export default function Page(): ReactElement {
  const queryClient = useQueryClient();
  const { accessToken, user, setSession, clearSession } = useSessionStore();
  const supabaseAuthEnabled = isSupabaseAuthEnabled();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMfaCode, setLoginMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [auditFilter, setAuditFilter] = useState("");
  const [strategyName, setStrategyName] = useState("Momentum Guard");
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState<MarketTimeframe>("1h");
  const [activeTab, setActiveTab] = useState<TerminalTab>("overview");
  const [selectedStrategyId, setSelectedStrategyId] = useState("");
  const [watchlistInput, setWatchlistInput] = useState("");
  const [alpacaApiKey, setAlpacaApiKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [walkForwardResult, setWalkForwardResult] = useState<WalkForwardResult | null>(null);
  const [notice, setNotice] = useState("");
  const [riskNotice, setRiskNotice] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");

  const token = accessToken ?? "";
  const authenticated = Boolean(accessToken && user);

  useEffect(() => {
    if (!supabaseAuthEnabled || authenticated) {
      return;
    }
    void refreshSupabaseSession()
      .then((session) => {
        if (session) {
          setSession(session);
        }
      })
      .catch(() => undefined);
  }, [authenticated, setSession, supabaseAuthEnabled]);

  const portfolios = useQuery({
    queryKey: ["portfolios", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<Portfolio>("/portfolios", {}, token)
  });
  const strategies = useQuery({
    queryKey: ["strategies", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<Strategy>("/strategies", {}, token)
  });
  const signals = useQuery({
    queryKey: ["signals", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<Signal>("/signals/history", {}, token)
  });
  const orders = useQuery({
    queryKey: ["orders", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<Order>("/orders", {}, token)
  });
  const trades = useQuery({
    queryKey: ["trades", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<Trade>("/trades/history", {}, token)
  });
  const positions = useQuery({
    queryKey: ["positions", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<Position>("/positions", {}, token)
  });
  const risk = useQuery({
    queryKey: ["risk", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetch<RiskRules>("/risk", {}, token)
  });
  const analytics = useQuery({
    queryKey: ["analytics", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetch<PerformanceSummary>("/analytics/performance", {}, token)
  });
  const notifications = useQuery({
    queryKey: ["notifications", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<Notification>("/notifications", {}, token)
  });
  const profile = useQuery({
    queryKey: ["profile", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetch<PublicUser>("/users/profile", {}, token)
  });
  const brokerAccounts = useQuery({
    queryKey: ["broker-accounts", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<BrokerAccountView>("/brokers/accounts", {}, token)
  });
  const marketPrices = useQuery({
    queryKey: ["market-prices", symbol, timeframe, accessToken],
    enabled: authenticated,
    queryFn: () =>
      apiFetchPage<MarketCandle>(
        `/market/prices/${encodeURIComponent(symbol)}?timeframe=${timeframe}`,
        {},
        token
      )
  });
  const marketQuote = useQuery({
    queryKey: ["market-quote", symbol, timeframe, accessToken],
    enabled: authenticated,
    refetchInterval: realtimeConnected ? false : 5_000,
    queryFn: () =>
      apiFetch<MarketQuote>(
        `/market/quotes/${encodeURIComponent(symbol)}?timeframe=${timeframe}`,
        {},
        token
      )
  });
  const marketIndicators = useQuery({
    queryKey: ["market-indicators", symbol, timeframe, accessToken],
    enabled: authenticated,
    queryFn: () =>
      apiFetch<IndicatorSnapshot>(
        `/market/indicators/${encodeURIComponent(symbol)}?timeframe=${timeframe}`,
        {},
        token
      )
  });
  const watchlists = useQuery({
    queryKey: ["watchlists", accessToken],
    enabled: authenticated,
    queryFn: () => apiFetchPage<WatchlistView>("/market/watchlists", {}, token)
  });
  const auditLogs = useQuery({
    queryKey: ["admin-audit", accessToken],
    enabled: authenticated && user?.role === "ADMIN",
    queryFn: () => apiFetchPage<AuditLog>("/admin/audit-logs", {}, token)
  });
  const adminUsers = useQuery({
    queryKey: ["admin-users", accessToken],
    enabled: authenticated && user?.role === "ADMIN",
    queryFn: () => apiFetchPage<PublicUser>("/admin/users", {}, token)
  });
  const systemHealth = useQuery({
    queryKey: ["admin-health", accessToken],
    enabled: authenticated && user?.role === "ADMIN",
    queryFn: () => apiFetch<SystemHealthView>("/admin/system-health", {}, token)
  });
  const operationalMetrics = useQuery({
    queryKey: ["admin-metrics", accessToken],
    enabled: authenticated && user?.role === "ADMIN",
    refetchInterval: 10_000,
    queryFn: () => apiFetch<OperationalMetricsSnapshot>("/admin/metrics", {}, token)
  });

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
      socket.emit("market:subscribe", { symbols: [symbol], timeframe });
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
          void queryClient.invalidateQueries({ queryKey: ["signals"] });
          break;
        case "order.updated":
          void queryClient.invalidateQueries({ queryKey: ["orders"] });
          break;
        case "trade.executed":
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: ["trades"] }),
            queryClient.invalidateQueries({ queryKey: ["positions"] }),
            queryClient.invalidateQueries({ queryKey: ["portfolios"] }),
            queryClient.invalidateQueries({ queryKey: ["analytics"] })
          ]);
          break;
        case "notification.created":
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
  }, [accessToken, authenticated, queryClient, symbol, timeframe, token]);

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
  const latestCandle = marketPrices.data?.[marketPrices.data.length - 1];
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
  const terminalTabs: readonly {
    readonly id: TerminalTab;
    readonly label: string;
    readonly icon: ReactNode;
  }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="h-4 w-4" aria-hidden="true" /> },
    { id: "market", label: "Market", icon: <LineChart className="h-4 w-4" aria-hidden="true" /> },
    { id: "strategies", label: "Strategies", icon: <Bot className="h-4 w-4" aria-hidden="true" /> },
    { id: "risk", label: "Risk & Alerts", icon: <Shield className="h-4 w-4" aria-hidden="true" /> },
    { id: "lab", label: "Simulation Lab", icon: <FlaskConical className="h-4 w-4" aria-hidden="true" /> },
    ...(user?.role === "ADMIN"
      ? [{ id: "admin" as const, label: "Admin", icon: <Users className="h-4 w-4" aria-hidden="true" /> }]
      : [])
  ];

  const invalidateTradingData = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["portfolios"] }),
      queryClient.invalidateQueries({ queryKey: ["strategies"] }),
      queryClient.invalidateQueries({ queryKey: ["signals"] }),
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
      queryClient.invalidateQueries({ queryKey: ["trades"] }),
      queryClient.invalidateQueries({ queryKey: ["positions"] }),
      queryClient.invalidateQueries({ queryKey: ["risk"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
      queryClient.invalidateQueries({ queryKey: ["market-prices"] }),
      queryClient.invalidateQueries({ queryKey: ["market-quote"] }),
      queryClient.invalidateQueries({ queryKey: ["market-indicators"] }),
      queryClient.invalidateQueries({ queryKey: ["watchlists"] }),
      queryClient.invalidateQueries({ queryKey: ["broker-accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-health"] })
    ]);
  };

  const registerMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ readonly user: PublicUser }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword,
          firstName: "Paper",
          lastName: "Trader"
        })
      }),
    onSuccess: () => {
      setNotice("Registration complete. Login is ready.");
      setLoginEmail(registerEmail);
      setLoginPassword(registerPassword);
      setAuthMode("login");
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Registration failed.");
    }
  });

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
        await apiFetch<{ readonly loggedOut: true }>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({})
        }, token).catch(() => undefined);
      }
      await signOutSupabase();
    },
    onSettled: () => {
      clearSession();
      setNotice("Logged out.");
      setAuthMode("login");
      setActiveTab("overview");
      setMfaSetup(null);
      setMfaCode("");
    }
  });

  const createStrategyMutation = useMutation({
    mutationFn: () =>
      apiFetch<Strategy>("/strategies", {
        method: "POST",
        body: JSON.stringify({
          name: strategyName,
          description: "EMA, RSI, and MACD assisted paper strategy.",
          status: "ACTIVE",
          configuration: {
            riskPercent: 1,
            indicators: ["EMA", "RSI", "MACD"],
            automationMode: "SEMI_AUTO"
          }
        })
      }, token),
    onSuccess: async (strategy) => {
      setNotice(`Strategy ${strategy.name} created.`);
      await invalidateTradingData();
    }
  });

  const generateSignalMutation = useMutation({
    mutationFn: () => {
      if (!activeStrategy) {
        throw new Error("Create a strategy first.");
      }
      return apiFetch<Signal>("/signals/generate", {
        method: "POST",
        body: JSON.stringify({
          strategyId: activeStrategy.id,
          symbol
        })
      }, token);
    },
    onSuccess: async (signal) => {
      setNotice(`${signal.signalType} signal generated for ${signal.symbol}.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Signal generation failed.");
    }
  });

  const executeTradeMutation = useMutation({
    mutationFn: () => {
      if (!latestSignal || !activeStrategy) {
        throw new Error("Generate a signal first.");
      }
      const price = featureNumber(latestSignal.features, "latestClose") ?? 195;
      const side = latestSignal.signalType === "SELL" ? "SELL" : "BUY";
      const stopLoss = side === "BUY" ? price * 0.98 : price * 1.02;
      const takeProfit = side === "BUY" ? price * 1.05 : price * 0.95;
      return apiFetch<OrderExecutionPayload>("/orders", {
        method: "POST",
        body: JSON.stringify({
          strategyId: activeStrategy.id,
          signalId: latestSignal.id,
          symbol: latestSignal.symbol,
          side,
          orderType: "MARKET",
          mode: "SEMI_AUTO",
          quantity: 5,
          price: Number(price.toFixed(2)),
          stopLoss: Number(stopLoss.toFixed(2)),
          takeProfit: Number(takeProfit.toFixed(2))
        })
      }, token);
    },
    onSuccess: async (payload) => {
      setNotice(`Paper trade ${payload.order.status.toLowerCase()} for ${payload.order.symbol}.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Trade execution failed.");
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
      apiFetch<OrderExecutionPayload>("/orders", {
        method: "POST",
        body: JSON.stringify({
          ...order,
          mode: "MANUAL"
        })
      }, token),
    onSuccess: async (payload) => {
      setNotice(`Manual paper order ${payload.order.status.toLowerCase()} for ${payload.order.symbol}.`);
      await invalidateTradingData();
    },
    onError: async (error) => {
      setNotice(error instanceof Error ? error.message : "Manual order failed.");
      await invalidateTradingData();
    }
  });

  const automatedRunMutation = useMutation({
    mutationFn: () => {
      if (!activeStrategy) {
        throw new Error("Create a strategy first.");
      }
      return apiFetch<AutomationRunResult>("/automation/run", {
        method: "POST",
        body: JSON.stringify({
          strategyId: activeStrategy.id,
          symbol,
          confidenceThreshold: 60,
          stopLossPercent: 5,
          takeProfitPercent: 8
        })
      }, token);
    },
    onSuccess: async (payload) => {
      setNotice(
        payload.status === "EXECUTED"
          ? `Automated paper trade ${payload.execution?.order.status.toLowerCase()} for ${payload.symbol}.`
          : `Automation skipped for ${payload.symbol}.`
      );
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Automation run failed.");
    }
  });

  const invalidTradeMutation = useMutation({
    mutationFn: () =>
      apiFetch<OrderExecutionPayload>("/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side: "BUY",
          orderType: "MARKET",
          mode: "AUTO",
          quantity: 100000,
          price: 200,
          stopLoss: 150,
          takeProfit: 260
        })
      }, token),
    onSuccess: async () => {
      setRiskNotice("Unexpected approval.");
      await invalidateTradingData();
    },
    onError: async (error) => {
      const message =
        error instanceof ApiError && error.code === "RISK_REJECTED"
          ? `Risk rule blocked invalid trade: ${error.message}`
          : "Risk validation failed.";
      setRiskNotice(message);
      await invalidateTradingData();
    }
  });

  const updateWatchlistMutation = useMutation({
    mutationFn: (symbols: readonly string[]) =>
      apiFetch<WatchlistView>("/market/watchlists", {
        method: "PUT",
        body: JSON.stringify({ symbols })
      }, token),
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
      apiFetch<Strategy>(`/strategies/${input.id}`, {
        method: "PUT",
        body: JSON.stringify(input.body)
      }, token),
    onSuccess: async (strategy) => {
      setNotice(`Strategy ${strategy.name} updated.`);
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Strategy update failed.");
    }
  });

  const updateRiskMutation = useMutation({
    mutationFn: (body: Record<string, number | boolean>) =>
      apiFetch<RiskRules>("/risk", {
        method: "PUT",
        body: JSON.stringify(body)
      }, token),
    onSuccess: async () => {
      setNotice("Risk controls updated.");
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Risk update failed.");
    }
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (notificationPreferences: PublicUser["notificationPreferences"]) =>
      apiFetch<PublicUser>("/users/profile", {
        method: "PUT",
        body: JSON.stringify({ notificationPreferences })
      }, token),
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
      apiFetch<BrokerAccountView>("/brokers/connect", {
        method: "POST",
        body: JSON.stringify({
          brokerName: "ALPACA",
          environment: "PAPER",
          apiKey: alpacaApiKey.trim(),
          secret: alpacaSecret.trim()
        })
      }, token),
    onSuccess: async () => {
      setAlpacaApiKey("");
      setAlpacaSecret("");
      setNotice("Alpaca paper account connected. Balances and market data will load from your broker.");
      await invalidateTradingData();
    },
    onError: (error) => {
      setNotice(error instanceof Error ? error.message : "Broker connection failed.");
    }
  });

  const markNotificationsReadMutation = useMutation({
    mutationFn: () =>
      apiFetch<readonly Notification[]>("/notifications/read", {
        method: "PUT",
        body: JSON.stringify({})
      }, token),
    onSuccess: async () => {
      setNotice("Notifications marked as read.");
      await invalidateTradingData();
    }
  });

  const setupMfaMutation = useMutation({
    mutationFn: () =>
      apiFetch<MfaSetup>("/auth/mfa/setup", {
        method: "POST",
        body: JSON.stringify({})
      }, token),
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
      apiFetch<PublicUser>("/auth/mfa/enable", {
        method: "POST",
        body: JSON.stringify({ code: mfaCode })
      }, token),
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
      apiFetch<PublicUser>("/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({ code: mfaCode })
      }, token),
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
      apiFetch<{ readonly user: PublicUser; readonly temporaryPassword: string }>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          firstName: newUserFirstName || "Platform",
          lastName: newUserLastName || "User",
          role: "TRADER"
        })
      }, token),
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
      apiFetch<PublicUser>(`/admin/users/${input.userId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: input.status })
      }, token),
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
      apiFetch<BacktestResult>("/backtests/run", {
        method: "POST",
        body: JSON.stringify(body)
      }, token),
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
      apiFetch<WalkForwardResult>("/backtests/walk-forward", {
        method: "POST",
        body: JSON.stringify(body)
      }, token),
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

  if (!authenticated) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-8">
        <section className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-8 md:grid-cols-[1fr_420px]">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-400/10">
                <LineChart className="h-6 w-6 text-emerald-300" aria-hidden="true" />
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-emerald-200">QuantCore</p>
                <h1 className="text-4xl font-semibold text-white md:text-6xl">AI Trading Platform</h1>
              </div>
            </div>
            <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="border-l-2 border-emerald-400 bg-white/[0.03] p-4">
                <Shield className="mb-3 h-5 w-5 text-emerald-300" aria-hidden="true" />
                Risk engine final authority
              </div>
              <div className="border-l-2 border-violetSignal bg-white/[0.03] p-4">
                <Sparkles className="mb-3 h-5 w-5 text-violet-300" aria-hidden="true" />
                Model-versioned AI signals
              </div>
              <div className="border-l-2 border-caution bg-white/[0.03] p-4">
                <ClipboardList className="mb-3 h-5 w-5 text-amber-300" aria-hidden="true" />
                Immutable audit events
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel/95 p-5 shadow-2xl">
            {!supabaseAuthEnabled ? (
              <div className="mb-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setMfaChallenge(false);
                    setLoginMfaCode("");
                  }}
                  className={`rounded-md px-4 py-2 text-sm ${authMode === "register" ? "bg-emerald-500 text-slate-950" : "bg-white/5 text-slate-200"}`}
                >
                  Register
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`rounded-md px-4 py-2 text-sm ${authMode === "login" ? "bg-violetSignal text-white" : "bg-white/5 text-slate-200"}`}
                >
                  Login
                </button>
              </div>
            ) : (
              <p className="mb-5 text-sm text-slate-300">
                Access is invite-only. Sign in with credentials provided by your administrator.
              </p>
            )}

            {!supabaseAuthEnabled && authMode === "register" ? (
              <form
                className="space-y-4"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  registerMutation.mutate();
                }}
              >
                <label className="block text-sm text-slate-300">
                  Email
                  <input
                    data-testid="register-email"
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-3 text-white outline-none focus:border-emerald-400"
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Password
                  <input
                    data-testid="register-password"
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-3 text-white outline-none focus:border-emerald-400"
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
                <button
                  data-testid="register-submit"
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 font-medium text-slate-950"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create Account
                </button>
              </form>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  loginMutation.mutate();
                }}
              >
                <label className="block text-sm text-slate-300">
                  Email
                  <input
                    data-testid="login-email"
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-3 text-white outline-none focus:border-violetSignal"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Password
                  <input
                    data-testid="login-password"
                    className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-3 text-white outline-none focus:border-violetSignal"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </label>
                {mfaChallenge ? (
                  <label className="block text-sm text-slate-300">
                    Authenticator code
                    <input
                      data-testid="login-mfa-code"
                      className="mt-2 w-full rounded-md border border-violet-400/60 bg-surface px-3 py-3 font-mono text-white outline-none focus:border-violetSignal"
                      value={loginMfaCode}
                      onChange={(event) => setLoginMfaCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                  </label>
                ) : null}
                <button
                  data-testid="login-submit"
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 font-medium text-white"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Enter Platform
                </button>
              </form>
            )}

            {notice ? (
              <p data-testid="auth-notice" className="mt-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-slate-200">
                {notice}
              </p>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5 md:px-6">
      <header className="mb-5 flex flex-col gap-4 border-b border-line pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-400/10">
            <LineChart className="h-5 w-5 text-emerald-300" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">QuantCore Terminal</p>
            <h1 data-testid="dashboard-title" className="text-2xl font-semibold text-white">
              Trader Dashboard
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-slate-200">
            {user?.email}
          </span>
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-slate-200"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </button>
        </div>
      </header>

      {notice ? (
        <div data-testid="workflow-notice" className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <nav
        aria-label="Terminal views"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-line pb-2"
      >
        {terminalTabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm ${
              activeTab === tab.id
                ? "bg-emerald-500 text-slate-950"
                : "border border-line bg-surface text-slate-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <>
          <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={<DollarSign />} label="Portfolio Value" value={formatCurrency(primaryPortfolio?.portfolioValue)} tone="emerald" />
            <MetricCard icon={<Gauge />} label="Cash Balance" value={formatCurrency(primaryPortfolio?.cashBalance)} tone="violet" />
            <MetricCard icon={<LineChart />} label="Realized P&L" value={formatCurrency(primaryPortfolio?.realizedPnl)} tone="emerald" />
            <MetricCard icon={<Activity />} label="Unrealized P&L" value={formatCurrency(primaryPortfolio?.unrealizedPnl)} tone="cyan" />
            <MetricCard icon={<Activity />} label="Win Rate" value={formatPercent(analytics.data?.winRate)} tone="amber" />
            <MetricCard icon={<Shield />} label="Max Drawdown" value={formatPercent(analytics.data?.maxDrawdown)} tone="rose" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <Panel title="Strategy Management" icon={<Bot className="h-5 w-5" aria-hidden="true" />}>
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input
                    data-testid="strategy-name"
                    aria-label="New strategy name"
                    className="rounded-md border border-line bg-surface px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
                    value={strategyName}
                    onChange={(event) => setStrategyName(event.target.value)}
                  />
                  <button
                    data-testid="create-strategy"
                    type="button"
                    onClick={() => createStrategyMutation.mutate()}
                    className="flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create Strategy
                  </button>
                  <span data-testid="strategy-status" className="rounded-md border border-line bg-white/5 px-4 py-3 text-sm text-slate-200">
                    {strategies.data?.length ?? 0} configured
                  </span>
                </div>
              </Panel>

              <Panel title="AI Signal Center" icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
                <div className="grid gap-3 md:grid-cols-[160px_auto_1fr]">
                  <input
                    data-testid="signal-symbol"
                    aria-label="Signal symbol"
                    className="rounded-md border border-line bg-surface px-3 py-3 font-mono text-sm text-white outline-none focus:border-violetSignal"
                    value={symbol}
                    onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  />
                  <button
                    data-testid="generate-signal"
                    type="button"
                    onClick={() => generateSignalMutation.mutate()}
                    className="flex items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm font-medium text-white"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Generate Signal
                  </button>
                  <div data-testid="latest-signal" className="rounded-md border border-line bg-white/5 px-4 py-3 text-sm text-slate-200">
                    {latestSignal
                      ? `${latestSignal.signalType} ${latestSignal.symbol} confidence ${latestSignal.confidenceScore}%`
                      : "No signal yet"}
                  </div>
                </div>
              </Panel>

              <Panel title="Manual Order Ticket" icon={<ClipboardList className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
                <form
                  data-testid="manual-order-form"
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    manualTradeMutation.mutate({
                      symbol: String(formData.get("symbol") ?? "AAPL").toUpperCase(),
                      side: String(formData.get("side") ?? "BUY") as OrderSide,
                      orderType: String(formData.get("orderType") ?? "MARKET") as OrderType,
                      quantity: Number(formData.get("quantity")),
                      price: Number(formData.get("price")),
                      stopLoss: Number(formData.get("stopLoss")),
                      takeProfit: Number(formData.get("takeProfit"))
                    });
                  }}
                >
                  <label className="text-sm text-slate-300">
                    Symbol
                    <input name="symbol" defaultValue="AAPL" className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white" />
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
                  <ManualTradeInput name="quantity" label="Quantity" value={1} step="0.0001" />
                  <ManualTradeInput name="price" label="Reference price" value={200} step="0.01" />
                  <ManualTradeInput name="stopLoss" label="Stop loss" value={196} step="0.01" />
                  <ManualTradeInput name="takeProfit" label="Take profit" value={210} step="0.01" />
                  <button
                    data-testid="execute-manual-trade"
                    type="submit"
                    className="flex items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Submit Manual Order
                  </button>
                </form>
              </Panel>

              <Panel title="Paper Trading" icon={<CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    data-testid="execute-paper-trade"
                    type="button"
                    onClick={() => executeTradeMutation.mutate()}
                    className="flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Execute Paper Trade
                  </button>
                  <button
                    data-testid="run-automation"
                    type="button"
                    onClick={() => automatedRunMutation.mutate()}
                    className="flex items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950"
                  >
                    <Bot className="h-4 w-4" aria-hidden="true" />
                    Run Automation
                  </button>
                  <button
                    data-testid="execute-invalid-trade"
                    type="button"
                    onClick={() => invalidTradeMutation.mutate()}
                    className="flex items-center justify-center gap-2 rounded-md bg-rose-500 px-4 py-3 text-sm font-medium text-white"
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    Test Risk Block
                  </button>
                </div>
                <div className="mt-3 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                  Paper orders tracked: <span className="font-mono text-white">{orders.data?.length ?? 0}</span>
                </div>
                {riskNotice ? (
                  <p data-testid="risk-block-message" className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    {riskNotice}
                  </p>
                ) : null}
              </Panel>

              <Panel title="Portfolio Intelligence" icon={<LineChart className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <SmallStat label="Profit Factor" value={analytics.data?.profitFactor === Infinity ? "Inf" : (analytics.data?.profitFactor ?? 0).toFixed(2)} />
                  <SmallStat label="Sharpe Ratio" value={(analytics.data?.sharpeRatio ?? 0).toFixed(2)} />
                  <SmallStat label="Sortino Ratio" value={(analytics.data?.sortinoRatio ?? 0).toFixed(2)} />
                  <SmallStat label="Total Return" value={formatPercent(analytics.data?.totalReturn)} />
                  <SmallStat label="Average Trade" value={formatCurrency(analytics.data?.averageTrade)} />
                  <SmallStat label="Risk / Reward" value={(analytics.data?.riskRewardRatio ?? 0).toFixed(2)} />
                </div>
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel title="Risk Matrix" icon={<Shield className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
                <div className="grid gap-2 text-sm text-slate-200">
                  <RiskRow label="Risk per trade" value={formatPercent(risk.data?.maxRiskPerTradePercent)} />
                  <RiskRow label="Max position size" value={formatPercent(risk.data?.maxPositionSizePercent)} />
                  <RiskRow label="Daily loss limit" value={formatPercent(risk.data?.maxDailyLossPercent)} />
                  <RiskRow label="Max drawdown" value={formatPercent(risk.data?.maxDrawdownPercent)} />
                </div>
              </Panel>

              <Panel title="Positions" icon={<Activity className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
                <div data-testid="positions-list" className="space-y-2">
                  {(positions.data ?? []).length === 0 ? (
                    <EmptyLine text="No open paper positions" />
                  ) : (
                    positions.data?.map((position) => (
                      <div key={position.id} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm sm:grid-cols-4">
                        <span className="font-mono text-white">{position.symbol}</span>
                        <span>{position.quantity.toFixed(2)}</span>
                        <span className="sm:text-right">{formatCurrency(position.averagePrice)}</span>
                        <span className={`text-right ${position.unrealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {formatCurrency(position.unrealizedPnl)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel title="Trade History" icon={<History className="h-5 w-5 text-amber-300" aria-hidden="true" />}>
                <div data-testid="trade-history" className="space-y-2">
                  {(trades.data ?? []).length === 0 ? (
                    <EmptyLine text="No paper trades yet" />
                  ) : (
                    trades.data?.slice(-5).map((trade) => (
                      <div key={trade.id} className="grid grid-cols-4 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm">
                        <span className="font-mono text-white">{trade.symbol}</span>
                        <span>{trade.side}</span>
                        <span>{trade.quantity.toFixed(2)}</span>
                        <span className="text-right">{formatCurrency(trade.entryPrice)}</span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </section>
        </>
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
                  <SmallStat label="SMA 20" value={(marketIndicators.data?.sma ?? 0).toFixed(2)} />
                  <SmallStat label="EMA 20" value={(marketIndicators.data?.ema ?? 0).toFixed(2)} />
                  <SmallStat label="RSI 14" value={(marketIndicators.data?.rsi ?? 0).toFixed(2)} />
                  <SmallStat label="ATR 14" value={(marketIndicators.data?.atr ?? 0).toFixed(2)} />
                  <SmallStat label="MACD" value={(marketIndicators.data?.macd.macd ?? 0).toFixed(2)} />
                  <SmallStat label="MACD Signal" value={(marketIndicators.data?.macd.signal ?? 0).toFixed(2)} />
                  <SmallStat label="Bollinger Upper" value={(marketIndicators.data?.bollingerBands.upper ?? 0).toFixed(2)} />
                  <SmallStat label="Volume SMA" value={(marketIndicators.data?.volume.sma ?? 0).toFixed(0)} />
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
                    className="flex w-full items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-left"
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
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-3 py-2 text-sm text-white"
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
          <Panel title="Strategy Registry" icon={<Bot className="h-5 w-5 text-emerald-300" aria-hidden="true" />}>
            <div className="space-y-2">
              {(strategies.data ?? []).map((strategy) => (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => setSelectedStrategyId(strategy.id)}
                  className={`w-full rounded-md border px-3 py-3 text-left ${
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
            </div>
          </Panel>

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
                <button data-testid="save-strategy" type="submit" className="flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 md:col-span-2">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save Strategy
                </button>
              </form>
            ) : (
              <EmptyLine text="Create a strategy from Overview to configure it here" />
            )}
          </Panel>
        </section>
      ) : null}

      {activeTab === "risk" ? (
        <section data-testid="risk-view" className="grid gap-5 xl:grid-cols-2">
          <Panel title="Alpaca Broker Connection" icon={<WalletCards className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Connect your Alpaca paper API keys to load real balances, positions, market data, and route orders to Alpaca.
              </p>
              {(brokerAccounts.data ?? []).some((account) => account.brokerName === "ALPACA" && account.hasCredentials) ? (
                <div
                  data-testid="alpaca-connected"
                  className="rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3 py-3 text-sm text-emerald-200"
                >
                  Alpaca paper account connected. Portfolio values sync from your broker.
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    connectBrokerMutation.mutate();
                  }}
                >
                  <label className="block text-sm text-slate-300">
                    API Key ID
                    <input
                      data-testid="alpaca-api-key"
                      className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white"
                      value={alpacaApiKey}
                      onChange={(event) => setAlpacaApiKey(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-sm text-slate-300">
                    Secret Key
                    <input
                      data-testid="alpaca-secret-key"
                      type="password"
                      className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-white"
                      value={alpacaSecret}
                      onChange={(event) => setAlpacaSecret(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    data-testid="connect-alpaca"
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950"
                  >
                    <WalletCards className="h-4 w-4" aria-hidden="true" />
                    Connect Alpaca Paper
                  </button>
                </form>
              )}
            </div>
          </Panel>

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
                <label className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-3 text-sm text-slate-200 sm:col-span-2">
                  <input name="stopTrading" type="checkbox" defaultChecked={risk.data.stopTrading} className="h-4 w-4 accent-rose-500" />
                  Stop all trading
                </label>
                <button data-testid="save-risk-rules" type="submit" className="flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 sm:col-span-2">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save Risk Rules
                </button>
              </form>
            ) : (
              <EmptyLine text="Risk rules are loading" />
            )}
          </Panel>

          <div className="space-y-5">
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
                  <label key={preference} className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm capitalize text-slate-200">
                    {preference} alerts
                    <input
                      name={preference}
                      type="checkbox"
                      defaultChecked={(profile.data?.notificationPreferences ?? user?.notificationPreferences)?.[preference] ?? true}
                      className="h-4 w-4 accent-violet-500"
                    />
                  </label>
                ))}
                <button data-testid="save-alert-preferences" type="submit" className="flex w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm text-white">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save Alert Preferences
                </button>
              </form>
            </Panel>

            <Panel title="Account Security" icon={<Lock className="h-5 w-5 text-violet-300" aria-hidden="true" />}>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-3 text-sm">
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
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm text-white"
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
                      className="block rounded-md border border-line bg-surface px-3 py-2 text-center text-sm text-slate-200"
                    >
                      Open Authenticator
                    </a>
                  </div>
                ) : null}

                {(mfaSetup || profile.data?.mfaEnabled) ? (
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
                      className={`flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm ${
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

            <Panel title="Notifications" icon={<ClipboardList className="h-5 w-5 text-cyan-300" aria-hidden="true" />}>
              <div className="space-y-2">
                {(notifications.data ?? []).slice(-6).reverse().map((notification) => (
                  <div key={notification.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="text-slate-200">{notification.title}</span>
                    <span className="font-mono text-xs text-slate-400">{notification.status}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => markNotificationsReadMutation.mutate()} className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-slate-200">
                Mark all read
              </button>
            </Panel>
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
                  value={primaryPortfolio?.portfolioValue && primaryPortfolio.portfolioValue > 0 ? primaryPortfolio.portfolioValue : 1}
                />
                <LabInput name="maxPositionPercent" label="Max position %" value={20} />
                <LabInput name="fastPeriod" label="Fast period" value={10} />
                <LabInput name="slowPeriod" label="Slow period" value={20} />
                <LabInput name="feePerTrade" label="Fee per trade" value={1} step="0.01" />
                <LabInput name="slippagePercent" label="Slippage %" value={0.05} step="0.01" />
                <LabInput name="trainSize" label="Training candles" value={45} />
                <LabInput name="testSize" label="Test candles" value={20} />
                <button data-testid="run-backtest" type="submit" className="flex items-center justify-center gap-2 rounded-md bg-violetSignal px-4 py-3 text-sm text-white sm:col-span-2">
                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                  Run Backtest
                </button>
                <button
                  data-testid="run-walk-forward"
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 sm:col-span-2"
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
                <button type="button" onClick={() => reportMutation.mutate("csv")} className="flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-3 text-sm text-slate-200">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export CSV
                </button>
                <button type="button" onClick={() => reportMutation.mutate("pdf")} className="flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-3 text-sm text-slate-200">
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

      {activeTab === "admin" && user?.role === "ADMIN" ? (
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
              {supabaseAuthEnabled ? (
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
                    className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                    placeholder="Email"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    autoComplete="off"
                  />
                  <input
                    data-testid="admin-create-password"
                    className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                    placeholder="Temporary password"
                    type="password"
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                      placeholder="First name"
                      value={newUserFirstName}
                      onChange={(event) => setNewUserFirstName(event.target.value)}
                    />
                    <input
                      className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                      placeholder="Last name"
                      value={newUserLastName}
                      onChange={(event) => setNewUserLastName(event.target.value)}
                    />
                  </div>
                  <button
                    data-testid="admin-create-submit"
                    type="submit"
                    className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950"
                  >
                    Create user
                  </button>
                </form>
              ) : null}
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
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white/5 text-slate-200"
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
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly tone: "emerald" | "violet" | "cyan" | "amber" | "rose";
}): ReactElement {
  const toneClass = {
    emerald: "text-emerald-300 border-emerald-400/30",
    violet: "text-violet-300 border-violet-400/30",
    cyan: "text-cyan-300 border-cyan-400/30",
    amber: "text-amber-300 border-amber-400/30",
    rose: "text-rose-300 border-rose-400/30"
  }[tone];

  return (
    <div className={`rounded-lg border bg-white/[0.035] p-4 ${toneClass}`}>
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-white/5 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Panel({
  title,
  icon,
  children
}: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-panel/90 p-4 shadow-xl">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SmallStat({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-lg text-white">{value}</p>
    </div>
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
  step = "1"
}: {
  readonly name: string;
  readonly label: string;
  readonly value: number;
  readonly step?: string;
}): ReactElement {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <input
        name={name}
        type="number"
        min="0"
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

function RiskRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2">
      <span>{label}</span>
      <span className="font-mono text-white">{value}</span>
    </div>
  );
}

function EmptyLine({ text }: { readonly text: string }): ReactElement {
  return <div className="rounded-md border border-dashed border-line px-3 py-3 text-sm text-slate-400">{text}</div>;
}
