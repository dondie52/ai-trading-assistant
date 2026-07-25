import { describe, expect, it } from "vitest";
import type { BrokerAccountView } from "@trading/types";
import { resolveBrokerConnectionState } from "./broker-connection";

const baseAccount = {
  id: "acct-1",
  userId: "user-1",
  accountId: "PA12345678",
  environment: "PAPER" as const,
  status: "CONNECTED" as const,
  lastSyncedAt: new Date().toISOString(),
  createdAt: new Date().toISOString()
};

const paperAccount: BrokerAccountView = {
  ...baseAccount,
  brokerName: "PAPER",
  hasCredentials: false
};

const alpacaAccount: BrokerAccountView = {
  ...baseAccount,
  id: "acct-2",
  brokerName: "ALPACA",
  hasCredentials: true
};

describe("resolveBrokerConnectionState", () => {
  it("treats seeded PAPER as paper-only, not Alpaca-connected", () => {
    const state = resolveBrokerConnectionState([paperAccount]);
    expect(state.paperConnected).toBe(true);
    expect(state.alpacaConnected).toBe(false);
    expect(state.alpaca).toBeUndefined();
    expect(state.paper?.brokerName).toBe("PAPER");
  });

  it("detects Alpaca credentials separately from PAPER", () => {
    const state = resolveBrokerConnectionState([paperAccount, alpacaAccount]);
    expect(state.paperConnected).toBe(true);
    expect(state.alpacaConnected).toBe(true);
    expect(state.alpaca?.brokerName).toBe("ALPACA");
  });

  it("ignores ALPACA rows without credentials", () => {
    const state = resolveBrokerConnectionState([
      {
        ...alpacaAccount,
        hasCredentials: false
      }
    ]);
    expect(state.alpacaConnected).toBe(false);
  });
});
