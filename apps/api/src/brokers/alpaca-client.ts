import type { MarketCandle, MarketTimeframe, Order, OrderSide, OrderType } from "@trading/types";
import type { BrokerCredentials } from "./broker.interface.js";

export interface AlpacaAccount {
  readonly id: string;
  readonly accountNumber: string;
  readonly cash: number;
  readonly equity: number;
  readonly buyingPower: number;
  readonly portfolioValue: number;
  readonly lastEquity: number;
}

export interface AlpacaPosition {
  readonly symbol: string;
  readonly quantity: number;
  readonly averagePrice: number;
  readonly marketValue: number;
  readonly unrealizedPnl: number;
}

const paperBaseUrl = "https://paper-api.alpaca.markets";
const liveBaseUrl = "https://api.alpaca.markets";
const dataPaperBaseUrl = "https://data.alpaca.markets";
const dataLiveBaseUrl = "https://data.alpaca.markets";

export const resolveAlpacaTradingBaseUrl = (environment: "PAPER" | "LIVE" = "PAPER"): string =>
  environment === "LIVE" ? liveBaseUrl : paperBaseUrl;

export const resolveAlpacaDataBaseUrl = (environment: "PAPER" | "LIVE" = "PAPER"): string =>
  environment === "LIVE" ? dataLiveBaseUrl : dataPaperBaseUrl;

const alpacaTimeframe = (timeframe: MarketTimeframe): string => {
  switch (timeframe) {
    case "1m":
      return "1Min";
    case "5m":
      return "5Min";
    case "15m":
      return "15Min";
    case "1h":
      return "1Hour";
    case "4h":
      return "4Hour";
    case "1d":
      return "1Day";
    default:
      return "1Min";
  }
};

const parseNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const authHeaders = (credentials: BrokerCredentials): Record<string, string> => ({
  "APCA-API-KEY-ID": credentials.apiKey,
  "APCA-API-SECRET-KEY": credentials.secret
});

const tradingFetch = async <T>(
  credentials: BrokerCredentials,
  path: string,
  init?: RequestInit
): Promise<T> => {
  const baseUrl = resolveAlpacaTradingBaseUrl(credentials.environment ?? "PAPER");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(credentials),
      ...(init?.headers ?? {})
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new Error(`Alpaca trading API request failed (${response.status}) for ${path}`);
  }
  return (await response.json()) as T;
};

const dataFetch = async <T>(
  credentials: BrokerCredentials,
  path: string,
  init?: RequestInit
): Promise<T> => {
  const baseUrl = resolveAlpacaDataBaseUrl(credentials.environment ?? "PAPER");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(credentials),
      ...(init?.headers ?? {})
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new Error(`Alpaca data API request failed (${response.status}) for ${path}`);
  }
  return (await response.json()) as T;
};

export const fetchAlpacaAccount = async (credentials: BrokerCredentials): Promise<AlpacaAccount> => {
  const payload = await tradingFetch<Record<string, unknown>>(credentials, "/v2/account");
  return {
    id: String(payload.id ?? ""),
    accountNumber: String(payload.account_number ?? payload.id ?? ""),
    cash: parseNumber(payload.cash),
    equity: parseNumber(payload.equity),
    buyingPower: parseNumber(payload.buying_power),
    portfolioValue: parseNumber(payload.portfolio_value),
    lastEquity: parseNumber(payload.last_equity)
  };
};

export const fetchAlpacaPositions = async (
  credentials: BrokerCredentials
): Promise<readonly AlpacaPosition[]> => {
  const payload = await tradingFetch<readonly Record<string, unknown>[]>(credentials, "/v2/positions");
  return payload.map((position) => ({
    symbol: String(position.symbol ?? "").toUpperCase(),
    quantity: parseNumber(position.qty),
    averagePrice: parseNumber(position.avg_entry_price),
    marketValue: parseNumber(position.market_value),
    unrealizedPnl: parseNumber(position.unrealized_pl)
  }));
};

const lookbackMsFor = (timeframe: MarketTimeframe, limit: number): number => {
  const unitMs: Record<MarketTimeframe, number> = {
    "1m": 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000
  };
  // Extra calendar buffer so weekends/holidays still return enough bars.
  return unitMs[timeframe] * limit * 3 + 10 * 24 * 60 * 60_000;
};

const mapAlpacaBars = (
  normalizedSymbol: string,
  timeframe: MarketTimeframe,
  bars: readonly Record<string, unknown>[]
): readonly MarketCandle[] =>
  bars.map((bar) => ({
    symbol: normalizedSymbol,
    timeframe,
    timestamp: String(bar.t ?? new Date().toISOString()),
    open: parseNumber(bar.o),
    high: parseNumber(bar.h),
    low: parseNumber(bar.l),
    close: parseNumber(bar.c),
    volume: parseNumber(bar.v)
  }));

export const fetchAlpacaBars = async (
  credentials: BrokerCredentials,
  symbol: string,
  timeframe: MarketTimeframe,
  limit = 100
): Promise<readonly MarketCandle[]> => {
  const normalizedSymbol = symbol.toUpperCase();
  // Keep `end` slightly in the past so free-tier SIP fallbacks stay valid.
  const end = new Date(Date.now() - 20 * 60 * 1000);
  const start = new Date(end.getTime() - lookbackMsFor(timeframe, limit));

  const fetchWithFeed = async (feed: "iex" | "sip"): Promise<readonly MarketCandle[]> => {
    const query = new URLSearchParams({
      timeframe: alpacaTimeframe(timeframe),
      start: start.toISOString(),
      end: end.toISOString(),
      limit: String(limit),
      adjustment: "raw",
      feed,
      sort: "asc"
    });
    const payload = await dataFetch<{ readonly bars?: readonly Record<string, unknown>[] | null }>(
      credentials,
      `/v2/stocks/${encodeURIComponent(normalizedSymbol)}/bars?${query.toString()}`
    );
    return mapAlpacaBars(normalizedSymbol, timeframe, payload.bars ?? []);
  };

  try {
    const iexBars = await fetchWithFeed("iex");
    if (iexBars.length > 0) {
      return iexBars;
    }
  } catch {
    // Try delayed SIP next.
  }

  try {
    const sipBars = await fetchWithFeed("sip");
    if (sipBars.length > 0) {
      return sipBars;
    }
  } catch {
    // Fall through to daily bars.
  }

  if (timeframe !== "1d") {
    return fetchAlpacaBars(credentials, normalizedSymbol, "1d", Math.min(limit, 100));
  }
  return [];
};

export const fetchAlpacaLatestQuote = async (
  credentials: BrokerCredentials,
  symbol: string
): Promise<{ readonly price: number; readonly bid: number; readonly ask: number; readonly timestamp: string }> => {
  const normalizedSymbol = symbol.toUpperCase();
  try {
    const payload = await dataFetch<{ readonly quote?: Record<string, unknown> }>(
      credentials,
      `/v2/stocks/${encodeURIComponent(normalizedSymbol)}/quotes/latest?feed=iex`
    );
    const quote = payload.quote;
    if (quote) {
      const bid = parseNumber(quote.bp);
      const ask = parseNumber(quote.ap);
      const price = bid > 0 && ask > 0 ? (bid + ask) / 2 : Math.max(bid, ask);
      return {
        price,
        bid,
        ask,
        timestamp: String(quote.t ?? new Date().toISOString())
      };
    }
  } catch {
    // Fall through to latest trade.
  }

  const tradePayload = await dataFetch<{ readonly trade?: Record<string, unknown> }>(
    credentials,
    `/v2/stocks/${encodeURIComponent(normalizedSymbol)}/trades/latest?feed=iex`
  );
  const trade = tradePayload.trade;
  const price = parseNumber(trade?.p);
  if (price <= 0) {
    throw new Error(`Alpaca quote unavailable for ${normalizedSymbol}`);
  }
  const spread = Math.max(0.01, price * 0.0002);
  return {
    price,
    bid: Number((price - spread / 2).toFixed(2)),
    ask: Number((price + spread / 2).toFixed(2)),
    timestamp: String(trade?.t ?? new Date().toISOString())
  };
};

const mapOrderSide = (side: OrderSide): string => side.toLowerCase();

const mapOrderType = (orderType: OrderType): string => {
  switch (orderType) {
    case "MARKET":
      return "market";
    case "LIMIT":
      return "limit";
    case "STOP":
      return "stop";
    default:
      return "market";
  }
};

const mapAlpacaOrderStatus = (status: unknown): Order["status"] => {
  switch (String(status ?? "").toLowerCase()) {
    case "filled":
      return "FILLED";
    case "partially_filled":
      return "PARTIALLY_FILLED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "rejected":
    case "expired":
      return "REJECTED";
    case "new":
    case "accepted":
    case "pending_new":
      return "SUBMITTED";
    default:
      return "SUBMITTED";
  }
};

export const submitAlpacaOrder = async (
  credentials: BrokerCredentials,
  order: Order,
  marketPrice?: number
): Promise<{ readonly brokerOrderId: string; readonly status: Order["status"]; readonly filledQuantity: number; readonly filledAveragePrice: number }> => {
  const body: Record<string, string> = {
    symbol: order.symbol,
    qty: String(order.quantity),
    side: mapOrderSide(order.side),
    type: mapOrderType(order.orderType),
    time_in_force: "day"
  };
  if (order.orderType === "LIMIT") {
    body.limit_price = String(order.price);
  }
  if (order.orderType === "STOP") {
    body.stop_price = String(order.price);
  }

  const created = await tradingFetch<Record<string, unknown>>(credentials, "/v2/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const brokerOrderId = String(created.id ?? "");
  let status = mapAlpacaOrderStatus(created.status);
  let filledQuantity = parseNumber(created.filled_qty);
  let filledAveragePrice = parseNumber(created.filled_avg_price);

  if (order.orderType === "MARKET" && status === "SUBMITTED" && brokerOrderId) {
    const settled = await tradingFetch<Record<string, unknown>>(credentials, `/v2/orders/${brokerOrderId}`);
    status = mapAlpacaOrderStatus(settled.status);
    filledQuantity = parseNumber(settled.filled_qty);
    filledAveragePrice = parseNumber(settled.filled_avg_price) || marketPrice || order.price;
  }

  return {
    brokerOrderId,
    status,
    filledQuantity,
    filledAveragePrice
  };
};

export const cancelAlpacaOrder = async (
  credentials: BrokerCredentials,
  brokerOrderId: string
): Promise<Order["status"]> => {
  await tradingFetch(credentials, `/v2/orders/${brokerOrderId}`, { method: "DELETE" });
  return "CANCELLED";
};

export const validateAlpacaConnection = async (credentials: BrokerCredentials): Promise<boolean> => {
  try {
    await fetchAlpacaAccount(credentials);
    return true;
  } catch {
    return false;
  }
};

export const resolveEnvAlpacaCredentials = (): BrokerCredentials | undefined => {
  const apiKey = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!apiKey || !secret) {
    return undefined;
  }
  return {
    apiKey,
    secret,
    environment: process.env.ALPACA_ENVIRONMENT === "LIVE" ? "LIVE" : "PAPER"
  };
};
