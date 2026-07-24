"use client";

import { Link2, RefreshCw, Shield, WalletCards } from "lucide-react";
import type { FormEvent, ReactElement } from "react";
import type { BrokerAccountView, Portfolio } from "@trading/types";
import { formatCurrency, maskAccountId } from "../../lib/format";
import { Panel, StatusPill } from "../ui/primitives";

export function BrokerConnectionCard({
  accounts,
  portfolio,
  apiKey,
  secret,
  onApiKeyChange,
  onSecretChange,
  onConnect,
  connecting,
  onReconnect
}: {
  readonly accounts: readonly BrokerAccountView[];
  readonly portfolio?: Portfolio | null;
  readonly apiKey: string;
  readonly secret: string;
  readonly onApiKeyChange: (value: string) => void;
  readonly onSecretChange: (value: string) => void;
  readonly onConnect: () => void;
  readonly connecting: boolean;
  readonly onReconnect?: () => void;
}): ReactElement {
  const alpaca = accounts.find((account) => account.brokerName === "ALPACA" && account.hasCredentials);
  const paper = accounts.find((account) => account.brokerName === "PAPER");
  const connected = Boolean(alpaca) || Boolean(paper);
  const active = alpaca ?? paper;

  return (
    <Panel
      title="Broker connection"
      icon={<WalletCards className="h-5 w-5 text-cyan-300" aria-hidden="true" />}
      action={
        <StatusPill
          label={connected ? "Connected" : "Disconnected"}
          tone={connected ? "emerald" : "amber"}
        />
      }
    >
      <div className="space-y-4" data-testid="broker-connection-card">
        {connected && active ? (
          <div
            data-testid="alpaca-connected"
            className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-3 py-3 text-sm text-emerald-100"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={active.environment === "LIVE" ? "Live" : "Paper"}
                tone={active.environment === "LIVE" ? "rose" : "cyan"}
              />
              <StatusPill label={active.brokerName} tone="slate" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                Account: <span className="font-mono">{maskAccountId(active.accountId)}</span>
              </p>
              <p>
                Buying power:{" "}
                <span className="font-mono">{formatCurrency(portfolio?.cashBalance)}</span>
              </p>
              <p>
                Last sync:{" "}
                <span className="font-mono">
                  {active.lastSyncedAt ? new Date(active.lastSyncedAt).toLocaleString() : "Just now"}
                </span>
              </p>
              <p className="text-emerald-100/80">
                {active.environment === "LIVE"
                  ? "Live trading requires explicit operator enablement."
                  : "Simulated paper money — not real funds."}
              </p>
            </div>
            {onReconnect ? (
              <button
                type="button"
                data-testid="reconnect-broker"
                onClick={onReconnect}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Reconnect / refresh
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-3 text-sm text-amber-50">
              <p className="font-medium">Broker not connected</p>
              <p className="mt-1 text-amber-100/80">
                Connect an Alpaca paper account to sync buying power and route paper orders. Strategy
                exploration and signal generation still work while disconnected.
              </p>
              <p className="mt-2 flex items-start gap-2 text-xs text-amber-100/70">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Keys are stored encrypted on the server. They are never shown in the browser bundle or logs.
                Some deployments also use operator-managed server credentials — ask your operator if keys
                are already provisioned.
              </p>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                onConnect();
              }}
            >
              <label className="block text-sm text-slate-300">
                API Key ID
                <input
                  data-testid="alpaca-api-key"
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-white"
                  value={apiKey}
                  onChange={(event) => onApiKeyChange(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Secret Key
                <input
                  data-testid="alpaca-secret-key"
                  type="password"
                  className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-white"
                  value={secret}
                  onChange={(event) => onSecretChange(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <button
                data-testid="connect-alpaca"
                type="submit"
                disabled={connecting}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Connect Alpaca Paper
              </button>
            </form>
          </div>
        )}
      </div>
    </Panel>
  );
}
