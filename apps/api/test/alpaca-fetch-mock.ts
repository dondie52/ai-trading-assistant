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

export interface AlpacaFetchMockOptions {
  /** Fill activities returned by /v2/account/activities/FILL. */
  readonly fills?: readonly Record<string, unknown>[];
  /** Positions returned by /v2/positions. */
  readonly positions?: readonly Record<string, unknown>[];
  /** Status reported for newly submitted orders. Defaults to an immediate fill. */
  readonly submitStatus?: string;
  /** Snapshot returned by GET /v2/orders/{id}. Defaults to a fill. */
  readonly orderSnapshot?: Record<string, unknown>;
  /** Historical bars. Pass [] to simulate an empty feed. */
  readonly bars?: readonly Record<string, unknown>[];
}

export const installAlpacaFetchMock = (
  options: AlpacaFetchMockOptions = {}
): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    // Must precede the /v2/account match: the activities path is a sub-route of it.
    if (url.includes("/v2/account/activities")) {
      return { ok: true, json: async () => options.fills ?? [] };
    }
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
      return { ok: true, json: async () => options.positions ?? [] };
    }
    if (url.includes("/bars")) {
      return { ok: true, json: async () => ({ bars: options.bars ?? buildBars() }) };
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
      const status = options.submitStatus ?? "filled";
      const filled = status === "filled" || status === "partially_filled";
      return {
        ok: true,
        json: async () => ({
          id: randomUUID(),
          client_order_id: String(body.client_order_id ?? ""),
          symbol: String(body.symbol ?? ""),
          status,
          filled_qty: filled ? String(body.qty ?? "1") : "0",
          filled_avg_price: filled ? "185.6" : ""
        })
      };
    }
    if (url.includes("/v2/orders?") && init?.method === "GET") {
      return { ok: true, json: async () => [] };
    }
    if (url.includes("/v2/orders/") && init?.method === "GET") {
      return {
        ok: true,
        json: async () =>
          options.orderSnapshot ?? {
            id: url.split("/v2/orders/")[1] ?? randomUUID(),
            status: "filled",
            filled_qty: "1",
            filled_avg_price: "185.6"
          }
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
