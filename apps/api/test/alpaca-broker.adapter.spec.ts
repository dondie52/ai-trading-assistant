import { afterEach, describe, expect, it, vi } from "vitest";
import { AlpacaBrokerAdapter } from "../src/brokers/alpaca-broker.adapter.js";

describe("Alpaca broker connection validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates paper credentials against Alpaca without exposing them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "acct-1",
        account_number: "PA123",
        cash: "10",
        equity: "10",
        buying_power: "10",
        portfolio_value: "10",
        last_equity: "10"
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new AlpacaBrokerAdapter();

    await expect(
      adapter.validateConnection({
        apiKey: "paper-key",
        secret: "paper-secret",
        environment: "PAPER"
      })
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://paper-api.alpaca.markets/v2/account",
      expect.objectContaining({
        headers: {
          "APCA-API-KEY-ID": "paper-key",
          "APCA-API-SECRET-KEY": "paper-secret"
        }
      })
    );
  });

  it("rejects missing credentials without making a request", async () => {
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_SECRET_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new AlpacaBrokerAdapter().validateConnection()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
