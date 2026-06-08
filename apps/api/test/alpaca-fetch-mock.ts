import { randomUUID } from "node:crypto";
import { vi } from "vitest";

const buildBars = (base = 180): readonly Record<string, unknown>[] =>
  Array.from({ length: 80 }, (_, index) => {
    const close = index < 60 ? base + index * 0.05 : base + 3 + (index - 60) * 0.4;
    return {
      t: new Date(Date.now() - (80 - index) * 60_000).toISOString(),
      o: close - 0.2,
      h: close + 0.5,
      l: close - 0.5,
      c: close,
      v: 1_000 + index
    };
  });

export const installAlpacaFetchMock = (): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/v2/account")) {
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
    if (url.includes("/v2/positions")) {
      return { ok: true, json: async () => [] };
    }
    if (url.includes("/bars")) {
      return { ok: true, json: async () => ({ bars: buildBars() }) };
    }
    if (url.includes("/quotes/latest")) {
      return {
        ok: true,
        json: async () => ({
          quote: { bp: 185.5, ap: 185.7, t: new Date().toISOString() }
        })
      };
    }
    if (url.includes("/trades/latest")) {
      return {
        ok: true,
        json: async () => ({
          trade: { p: 185.6, t: new Date().toISOString() }
        })
      };
    }
    if (url.includes("/v2/orders") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          id: randomUUID(),
          status: "filled",
          filled_qty: String(body.qty ?? "1"),
          filled_avg_price: "185.6"
        })
      };
    }
    if (url.includes("/v2/orders/") && init?.method === "GET") {
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
    if (url.includes("/v2/orders/") && init?.method === "DELETE") {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });

  vi.stubGlobal("fetch", fetchMock);
  process.env.ALPACA_API_KEY = "test-key";
  process.env.ALPACA_SECRET_KEY = "test-secret";
  process.env.ALPACA_ENVIRONMENT = "PAPER";
  return fetchMock;
};
