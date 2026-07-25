import type { BrokerAccountView } from "@trading/types";

export function resolveBrokerConnectionState(accounts: readonly BrokerAccountView[]): {
  readonly alpaca?: BrokerAccountView;
  readonly paper?: BrokerAccountView;
  readonly alpacaConnected: boolean;
  readonly paperConnected: boolean;
} {
  const alpaca = accounts.find((account) => account.brokerName === "ALPACA" && account.hasCredentials);
  const paper = accounts.find((account) => account.brokerName === "PAPER");
  return {
    ...(alpaca ? { alpaca } : {}),
    ...(paper ? { paper } : {}),
    alpacaConnected: Boolean(alpaca),
    paperConnected: Boolean(paper)
  };
}
