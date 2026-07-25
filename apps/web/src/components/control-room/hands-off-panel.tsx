"use client";

import { ExternalLink, Landmark, OctagonX, Rocket, Wallet } from "lucide-react";
import type { ReactElement } from "react";
import type {
  AutonomousBootstrapResult,
  AutomationSettings,
  DondieAgent,
  Portfolio
} from "@trading/types";
import { formatCurrency } from "../../lib/format";
import { Panel, StatusPill } from "../ui/primitives";

const ALPACA_URL = "https://app.alpaca.markets/";

export function HandsOffCapitalPanel({
  alpacaConnected,
  agent,
  automation,
  portfolio,
  autonomy,
  onConnectBroker,
  onGoAutonomous,
  onEmergencyStop,
  busy
}: {
  readonly alpacaConnected: boolean;
  readonly agent: DondieAgent | null | undefined;
  readonly automation: AutomationSettings | null | undefined;
  readonly portfolio: Portfolio | null | undefined;
  readonly autonomy?: AutonomousBootstrapResult | null;
  readonly onConnectBroker: () => void;
  readonly onGoAutonomous: () => void;
  readonly onEmergencyStop: () => void;
  readonly busy: boolean;
}): ReactElement {
  const handsOff =
    Boolean(agent?.status === "ACTIVE") &&
    automation?.mode === "AUTOPILOT" &&
    !automation.emergencyStop;
  const cash = portfolio?.cashBalance ?? 0;
  const equity = portfolio?.portfolioValue ?? 0;
  const profit = (portfolio?.realizedPnl ?? 0) + (portfolio?.unrealizedPnl ?? 0);

  return (
    <Panel
      title="Hands-off capital"
      icon={<Rocket className="h-5 w-5 text-cyan-300" aria-hidden="true" />}
      action={
        <StatusPill
          label={handsOff ? "Agent running" : alpacaConnected ? "Ready to start" : "Connect broker"}
          tone={handsOff ? "emerald" : "amber"}
        />
      }
    >
      <div className="space-y-4" data-testid="hands-off-panel">
        <p className="text-sm text-slate-300">
          You deposit and withdraw in Alpaca. Dondie picks the strategy, risk defaults, symbols, and
          runs on AUTOPILOT — no manual trade decisions required.
        </p>

        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-lg border border-line bg-surface px-3 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">1 · Deposit</p>
            <p className="mt-1 text-slate-200">Fund your Alpaca account. Buying power syncs here.</p>
          </li>
          <li className="rounded-lg border border-line bg-surface px-3 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">2 · Agent trades</p>
            <p className="mt-1 text-slate-200">
              {autonomy?.strategyName
                ? `Running ${autonomy.strategyName}.`
                : "Strategy and AUTOPILOT start after Alpaca connect."}
            </p>
          </li>
          <li className="rounded-lg border border-line bg-surface px-3 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">3 · Withdraw</p>
            <p className="mt-1 text-slate-200">When you like the profit, cash out in Alpaca.</p>
          </li>
        </ol>

        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <Stat label="Buying power" value={formatCurrency(cash)} />
          <Stat label="Equity" value={formatCurrency(equity)} />
          <Stat label="Open P&amp;L" value={formatCurrency(profit)} />
        </div>

        <div className="flex flex-wrap gap-2">
          {!alpacaConnected ? (
            <button
              type="button"
              data-testid="hands-off-connect"
              onClick={onConnectBroker}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950"
            >
              <Landmark className="h-4 w-4" aria-hidden="true" />
              Connect Alpaca
            </button>
          ) : null}

          {alpacaConnected && !handsOff ? (
            <button
              type="button"
              data-testid="hands-off-go-autonomous"
              disabled={busy}
              onClick={onGoAutonomous}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              Start hands-off mode
            </button>
          ) : null}

          <a
            href={autonomy?.capitalGuidance.alpacaDashboardUrl ?? ALPACA_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="hands-off-alpaca-deposit"
            className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-slate-200"
          >
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Deposit / withdraw in Alpaca
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          </a>

          {handsOff ? (
            <button
              type="button"
              data-testid="hands-off-emergency-stop"
              disabled={busy}
              onClick={onEmergencyStop}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 disabled:opacity-40"
            >
              <OctagonX className="h-4 w-4" aria-hidden="true" />
              Emergency stop
            </button>
          ) : null}
        </div>

        {handsOff ? (
          <p className="text-xs text-slate-500" data-testid="hands-off-status">
            AUTOPILOT active · Agent owns strategy selection · Your only jobs are fund and withdraw in
            Alpaca (plus emergency stop if needed).
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-white">{value}</p>
    </div>
  );
}
