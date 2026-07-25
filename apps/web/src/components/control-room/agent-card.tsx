"use client";

import { Bot, Pause, Play, Sparkles } from "lucide-react";
import type { ReactElement } from "react";
import type { DondieAgent, DondieMemory, DondieWalletLedgerEntry } from "@trading/types";
import { formatCurrency } from "../../lib/format";
import { Panel, StatusPill } from "../ui/primitives";

const tierUnlock: Record<DondieAgent["tier"], string> = {
  FREE: "Earn $25 wallet balance to unlock STANDARD brain",
  STANDARD: "Earn $100 wallet balance to unlock PRO brain",
  PRO: "PRO brain active — highest cognition tier"
};

export function SurvivalAgentCard({
  agent,
  ledger,
  memories,
  portfolioPnlToday,
  onActivate,
  onPause,
  onResume,
  onRun,
  canActivate,
  busy
}: {
  readonly agent: DondieAgent | null | undefined;
  readonly ledger: readonly DondieWalletLedgerEntry[];
  readonly memories: readonly DondieMemory[];
  readonly portfolioPnlToday: number;
  readonly onActivate: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onRun: () => void;
  readonly canActivate: boolean;
  readonly busy: boolean;
}): ReactElement {
  const lastMemory = memories[0];
  const costToday = ledger
    .filter((entry) => entry.entryType === "DEBIT" && entry.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const profitToday = ledger
    .filter((entry) => entry.entryType === "CREDIT" && entry.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <Panel
      title="Dondie Survival Agent"
      icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />}
      compact
    >
      <div data-testid="dondie-panel" className="space-y-3">
        {!agent ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Prefer hands-off? Connect Alpaca in Settings — or tap Start hands-off. Dondie picks the strategy and AUTOPILOT. Cognition wallet is not trading equity.
            </p>
            <button
              data-testid="dondie-activate"
              type="button"
              disabled={!canActivate || busy}
              onClick={onActivate}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-violetSignal px-4 py-3 text-sm text-white disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Start hands-off
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={agent.tier} tone="violet" />
              <StatusPill
                label={agent.status}
                tone={agent.status === "ACTIVE" ? "emerald" : agent.status === "PAUSED" ? "amber" : "rose"}
              />
              <StatusPill label="Paper survival loop" tone="cyan" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <AgentStat label="Cognition wallet" value={formatCurrency(agent.walletBalance)} hint="Not trading equity" />
              <AgentStat label="Brain / model" value={agent.tier} hint="Tiered cognition" />
              <AgentStat label="Cost today" value={formatCurrency(costToday)} hint="API / brain debit" />
              <AgentStat label="Wallet profit today" value={formatCurrency(profitToday)} hint="Simulated credits" />
            </div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-slate-400">
              <p>{tierUnlock[agent.tier]}</p>
              <p className="mt-1">
                Portfolio P&amp;L today (paper): {formatCurrency(portfolioPnlToday)} · Wallet is separate from account equity.
              </p>
              <p className="mt-1 text-slate-500">
                Last decision: {lastMemory?.summary ?? "No decisions yet"} · Current task:{" "}
                {agent.status === "ACTIVE" ? "Monitoring survival loop" : agent.status}
              </p>
              <p className="mt-1">
                Health: {agent.status === "SUSPENDED" ? "Needs operator attention" : "Nominal"}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                data-testid="dondie-pause"
                type="button"
                disabled={agent.status !== "ACTIVE" || busy}
                onClick={onPause}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
              >
                <Pause className="h-4 w-4" aria-hidden="true" />
                Pause
              </button>
              <button
                data-testid="dondie-resume"
                type="button"
                disabled={agent.status === "ACTIVE" || busy}
                onClick={onResume}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Resume
              </button>
              <button
                data-testid="dondie-run"
                type="button"
                disabled={agent.status !== "ACTIVE" || busy}
                onClick={onRun}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violetSignal px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                <Bot className="h-4 w-4" aria-hidden="true" />
                Run now
              </button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function AgentStat({
  label,
  value,
  hint
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-white">{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>
    </div>
  );
}
