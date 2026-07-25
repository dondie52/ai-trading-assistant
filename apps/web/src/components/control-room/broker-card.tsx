"use client";

import { Link2, RefreshCw, Shield, WalletCards } from "lucide-react";
import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import type { BrokerAccountView, Portfolio } from "@trading/types";
import { resolveBrokerConnectionState } from "../../lib/broker-connection";
import { formatCurrency, maskAccountId } from "../../lib/format";
import { Panel, StatusPill } from "../ui/primitives";

function AlpacaConnectForm({
  apiKey,
  secret,
  onApiKeyChange,
  onSecretChange,
  onConnect,
  connecting,
  compactIntro,
  updating
}: {
  readonly apiKey: string;
  readonly secret: string;
  readonly onApiKeyChange: (value: string) => void;
  readonly onSecretChange: (value: string) => void;
  readonly onConnect: () => void;
  readonly connecting: boolean;
  readonly compactIntro?: boolean;
  readonly updating?: boolean;
}): ReactElement {
  return (
    <div className="space-y-3" data-testid={updating ? "alpaca-update-form" : "alpaca-connect-form"}>
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-3 text-sm text-amber-50">
        <p className="font-medium">
          {updating
            ? "Update Alpaca credentials"
            : compactIntro
              ? "Connect Alpaca for live market data"
              : "Alpaca not connected"}
        </p>
        <p className="mt-1 text-amber-100/80">
          {updating
            ? "Paste your new Alpaca paper API Key ID and Secret Key. Existing keys are replaced after a successful connection."
            : "Paste your Alpaca paper API Key ID and Secret Key. After connect, Dondie starts hands-off AUTOPILOT — fund and withdraw only in Alpaca."}
        </p>
        <p className="mt-2 flex items-start gap-2 text-xs text-amber-100/70">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Keys are stored encrypted on the server. They are never shown in the browser bundle or logs.
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
            placeholder="PK..."
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
            placeholder="••••••••"
          />
        </label>
        <button
          data-testid="connect-alpaca"
          type="submit"
          disabled={connecting || !apiKey.trim() || !secret.trim()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {updating ? "Save new Alpaca keys" : "Connect Alpaca Paper"}
        </button>
      </form>
    </div>
  );
}

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
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const { alpaca, paper, alpacaConnected, paperConnected } = resolveBrokerConnectionState(accounts);
  const active = alpaca ?? paper;
  const statusLabel = alpacaConnected ? "Alpaca connected" : paperConnected ? "Paper only" : "Disconnected";
  const statusTone = alpacaConnected ? "emerald" : paperConnected ? "amber" : "amber";
  const showForm = !alpacaConnected || showUpdateForm;

  return (
    <Panel
      title="Broker connection"
      icon={<WalletCards className="h-5 w-5 text-cyan-300" aria-hidden="true" />}
      action={<StatusPill label={statusLabel} tone={statusTone} />}
    >
      <div id="broker-connection" className="space-y-4" data-testid="broker-connection-card">
        {active ? (
          <div
            data-testid={alpacaConnected ? "alpaca-connected" : "paper-broker-status"}
            className={`space-y-3 rounded-xl border px-3 py-3 text-sm ${
              alpacaConnected
                ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-100"
                : "border-amber-400/30 bg-amber-400/5 text-amber-50"
            }`}
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
              <p className={alpacaConnected ? "text-emerald-100/80" : "text-amber-100/80"}>
                {alpacaConnected
                  ? active.environment === "LIVE"
                    ? "Live trading requires explicit operator enablement."
                    : "Alpaca linked — agent manages strategy and AUTOPILOT. Deposit or withdraw in Alpaca."
                  : "No Alpaca credentials yet. Connect to fund trading and let the agent run hands-off."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onReconnect ? (
                <button
                  type="button"
                  data-testid="reconnect-broker"
                  onClick={onReconnect}
                  className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    alpacaConnected
                      ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-50"
                      : "border-amber-300/30 bg-amber-500/10 text-amber-50"
                  }`}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reconnect / refresh
                </button>
              ) : null}
              {alpacaConnected ? (
                <button
                  type="button"
                  data-testid="update-alpaca-credentials"
                  onClick={() => setShowUpdateForm((value) => !value)}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50"
                >
                  {showUpdateForm ? "Hide key form" : "Update Alpaca keys"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {showForm ? (
          <AlpacaConnectForm
            apiKey={apiKey}
            secret={secret}
            onApiKeyChange={onApiKeyChange}
            onSecretChange={onSecretChange}
            onConnect={onConnect}
            connecting={connecting}
            compactIntro={paperConnected && !alpacaConnected}
            updating={alpacaConnected}
          />
        ) : null}
      </div>
    </Panel>
  );
}
