import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@trading/types";
import {
  cancelAlpacaOrder,
  fetchAlpacaAccount,
  fetchAlpacaBars,
  fetchAlpacaLatestQuote,
  fetchAlpacaPositions,
  resolveAlpacaDataBaseUrl,
  resolveAlpacaTradingBaseUrl,
  resolveEnvAlpacaCredentials,
  submitAlpacaOrder,
  validateAlpacaConnection
} from "../src/brokers/alpaca-client.js";
import type { BrokerCredentials } from "../src/brokers/broker.interface.js";

const credentials: BrokerCredentials = {
  apiKey: "key",
  secret: "secret",
  environment: "PAPER"
};

const order = (orderType: Order["orderType"]): Order => ({
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  brokerAccountId: "33333333-3333-4333-8333-333333333333",
  symbol: "AAPL",
  side: "BUY",
  orderType,
  mode: "MANUAL",
  quantity: 2,
  price: 185.5,
  stopLoss: 180,
  takeProfit: 195,
  status: "SUBMITTED",
  submittedAt: "2026-06-09T00:00:00.000Z",
  riskDecision: {
    approved: true,
    reasons: [],
    maxRiskAmount: 1000,
    proposedRiskAmount: 11,
    proposedPositionValue: 371,
    calculatedQuantity: 2
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ALPACA_API_KEY;
  delete process.env.ALPACA_SECRET_KEY;
  delete process.env.ALPACA_ENVIRONMENT;
});

describe("Alpaca HTTP client", () => {
  it("normalizes account, positions, and historical bars", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "acct-1",
          account_number: "PA123",
          cash: "100.25",
          equity: 150,
          buying_power: "200",
          portfolio_value: "150",
          last_equity: "145"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            symbol: "aapl",
            qty: "2",
            avg_entry_price: "180",
            market_value: "371",
            unrealized_pl: "11"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          bars: [{ t: "2026-06-09T00:00:00.000Z", o: 180, h: "187", l: 179, c: 185.5, v: "1000" }]
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAlpacaAccount(credentials)).resolves.toMatchObject({
      accountNumber: "PA123",
      cash: 100.25,
      equity: 150
    });
    await expect(fetchAlpacaPositions(credentials)).resolves.toEqual([
      expect.objectContaining({ symbol: "AAPL", quantity: 2, unrealizedPnl: 11 })
    ]);
    await expect(fetchAlpacaBars(credentials, "aapl", "4h", 25)).resolves.toEqual([
      expect.objectContaining({ symbol: "AAPL", timeframe: "4h", close: 185.5, volume: 1000 })
    ]);
    expect(fetchMock.mock.calls[2]?.[0]).toContain("timeframe=4Hour");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("limit=25");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("feed=iex");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("start=");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("end=");
    expect(resolveAlpacaTradingBaseUrl("LIVE")).toBe("https://api.alpaca.markets");
    expect(resolveAlpacaDataBaseUrl("LIVE")).toBe("https://data.alpaca.markets");
  });

  it("uses quotes when available and falls back to latest trades", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ quote: { bp: "185.5", ap: "185.7", t: "2026-06-09T00:00:00.000Z" } })
      })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trade: { p: "190", t: "2026-06-09T00:01:00.000Z" } })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAlpacaLatestQuote(credentials, "aapl")).resolves.toEqual({
      price: 185.6,
      bid: 185.5,
      ask: 185.7,
      timestamp: "2026-06-09T00:00:00.000Z"
    });
    await expect(fetchAlpacaLatestQuote(credentials, "msft")).resolves.toMatchObject({
      price: 190,
      bid: 189.98,
      ask: 190.02
    });
  });

  it("submits market, limit, and stop orders and cancels broker orders", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "broker-1", status: "accepted", filled_qty: "0" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "broker-1",
          status: "filled",
          filled_qty: "2",
          filled_avg_price: null
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "broker-2", status: "partially_filled", filled_qty: "1", filled_avg_price: "184" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "broker-3", status: "rejected", filled_qty: "0", filled_avg_price: "0" })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitAlpacaOrder(credentials, order("MARKET"), 186)).resolves.toMatchObject({
      brokerOrderId: "broker-1",
      status: "FILLED",
      filledQuantity: 2,
      filledAveragePrice: 186
    });
    await expect(submitAlpacaOrder(credentials, order("LIMIT"))).resolves.toMatchObject({
      status: "PARTIALLY_FILLED",
      filledAveragePrice: 184
    });
    await expect(submitAlpacaOrder(credentials, order("STOP"))).resolves.toMatchObject({
      status: "REJECTED"
    });
    await expect(cancelAlpacaOrder(credentials, "broker-3")).resolves.toBe("CANCELLED");

    const limitBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as Record<string, string>;
    const stopBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body)) as Record<string, string>;
    expect(limitBody.limit_price).toBe("185.5");
    expect(stopBody.stop_price).toBe("185.5");
  });

  it("handles API failures and environment credentials without leaking errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );

    await expect(fetchAlpacaAccount(credentials)).rejects.toThrow("Alpaca trading API request failed");
    await expect(validateAlpacaConnection(credentials)).resolves.toBe(false);

    process.env.ALPACA_API_KEY = "env-key";
    process.env.ALPACA_SECRET_KEY = "env-secret";
    process.env.ALPACA_ENVIRONMENT = "LIVE";
    expect(resolveEnvAlpacaCredentials()).toEqual({
      apiKey: "env-key",
      secret: "env-secret",
      environment: "LIVE"
    });
    delete process.env.ALPACA_SECRET_KEY;
    expect(resolveEnvAlpacaCredentials()).toBeUndefined();
  });
});
