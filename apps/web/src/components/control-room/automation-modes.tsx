"use client";

import { LoaderCircle, OctagonPause, Play } from "lucide-react";
import type { ReactElement } from "react";
import type {
  AutomationMode,
  AutomationRunResult,
  AutomationRuntimeState,
  AutomationSettings
} from "@trading/types";
import { Panel, StatusPill } from "../ui/primitives";

const modeCopy: Record<
  AutomationMode,
  { readonly title: string; readonly description: string }
> = {
  MANUAL: {
    title: "Manual",
    description: "AI analyses markets. You create and submit every order."
  },
  ASSISTED: {
    title: "Assisted",
    description: "AI pre-fills the full order. You confirm paper execution."
  },
  AUTOPILOT: {
    title: "Autopilot",
    description: "Paper trades can execute when signal and risk gates pass. Live trading stays off."
  }
};

const runtimeTone: Record<
  AutomationRuntimeState,
  "emerald" | "amber" | "rose" | "cyan" | "violet" | "slate"
> = {
  RUNNING: "emerald",
  PAUSED: "amber",
  WAITING_FOR_MARKET: "cyan",
  BROKER_DISCONNECTED: "rose",
  RISK_LOCK: "rose",
  DAILY_LIMIT_REACHED: "amber",
  IDLE: "slate"
};

export function AutomationModesPanel({
  settings,
  runResult,
  running,
  onModeChange,
  onEmergencyPause,
  onRun,
  onSettingsPatch
}: {
  readonly settings?: AutomationSettings | null;
  readonly runResult?: AutomationRunResult | null;
  readonly running: boolean;
  readonly onModeChange: (mode: AutomationMode) => void;
  readonly onEmergencyPause: () => void;
  readonly onRun: () => void;
  readonly onSettingsPatch: (patch: Partial<AutomationSettings>) => void;
}): ReactElement {
  const mode = settings?.mode ?? "ASSISTED";
  const runtime = settings?.runtimeState ?? "IDLE";

  return (
    <Panel
      title="Automation"
      icon={<Play className="h-5 w-5 text-cyan-300" aria-hidden="true" />}
      action={<StatusPill label={runtime.replaceAll("_", " ")} tone={runtimeTone[runtime]} />}
    >
      <div className="space-y-4" data-testid="automation-modes">
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(modeCopy) as AutomationMode[]).map((item) => (
            <button
              key={item}
              type="button"
              data-testid={`automation-mode-${item.toLowerCase()}`}
              onClick={() => onModeChange(item)}
              className={`rounded-xl border px-3 py-3 text-left ${
                mode === item
                  ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-50"
                  : "border-line bg-surface text-slate-300"
              }`}
            >
              <p className="text-sm font-medium">{modeCopy[item].title}</p>
              <p className="mt-1 text-xs opacity-80">{modeCopy[item].description}</p>
            </button>
          ))}
        </div>

        {mode === "AUTOPILOT" && settings ? (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="autopilot-settings">
            <label className="text-sm text-slate-300">
              Minimum confidence
              <input
                type="number"
                min={0}
                max={100}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.minimumConfidence}
                onChange={(event) =>
                  onSettingsPatch({ minimumConfidence: Number(event.target.value) })
                }
              />
            </label>
            <label className="text-sm text-slate-300">
              Max trades / day
              <input
                type="number"
                min={0}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.maxTradesPerDay}
                onChange={(event) => onSettingsPatch({ maxTradesPerDay: Number(event.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-300">
              Risk per trade %
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.riskPerTradePercent}
                onChange={(event) =>
                  onSettingsPatch({ riskPerTradePercent: Number(event.target.value) })
                }
              />
            </label>
            <label className="text-sm text-slate-300">
              Max position %
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.maxPositionSizePercent}
                onChange={(event) =>
                  onSettingsPatch({ maxPositionSizePercent: Number(event.target.value) })
                }
              />
            </label>
            <label className="text-sm text-slate-300">
              Daily loss limit %
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.dailyLossLimitPercent}
                onChange={(event) =>
                  onSettingsPatch({ dailyLossLimitPercent: Number(event.target.value) })
                }
              />
            </label>
            <label className="text-sm text-slate-300">
              Max drawdown %
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.maxDrawdownPercent}
                onChange={(event) =>
                  onSettingsPatch({ maxDrawdownPercent: Number(event.target.value) })
                }
              />
            </label>
            <label className="text-sm text-slate-300">
              Cooldown (seconds)
              <input
                type="number"
                min={0}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.cooldownSeconds}
                onChange={(event) => onSettingsPatch({ cooldownSeconds: Number(event.target.value) })}
              />
            </label>
            <label className="text-sm text-slate-300">
              Confirm above order value
              <input
                type="number"
                min={0}
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-white"
                value={settings.requireConfirmationAboveValue}
                onChange={(event) =>
                  onSettingsPatch({ requireConfirmationAboveValue: Number(event.target.value) })
                }
              />
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 text-sm text-slate-200 sm:col-span-2">
              <input
                type="checkbox"
                checked={settings.marketHoursOnly}
                onChange={(event) => onSettingsPatch({ marketHoursOnly: event.target.checked })}
                className="h-4 w-4 accent-cyan-500"
              />
              Market hours only
            </label>
            <label className="text-sm text-slate-300 sm:col-span-2">
              Watchlist (comma separated)
              <input
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-white"
                value={settings.watchlist.join(", ")}
                onChange={(event) =>
                  onSettingsPatch({
                    watchlist: event.target.value
                      .split(",")
                      .map((item) => item.trim().toUpperCase())
                      .filter(Boolean)
                  })
                }
              />
            </label>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            data-testid="run-automation"
            type="button"
            disabled={running || settings?.emergencyStop}
            onClick={onRun}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
          >
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            Run automation
          </button>
          <button
            data-testid="emergency-pause"
            type="button"
            onClick={onEmergencyPause}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-3 text-sm font-medium text-white"
          >
            <OctagonPause className="h-4 w-4" aria-hidden="true" />
            Emergency stop
          </button>
        </div>

        {runResult ? (
          <div data-testid="automation-run-summary" className="space-y-2 rounded-xl border border-line bg-surface px-3 py-3 text-sm text-slate-200">
            {runResult.steps ? (
              <ol className="space-y-1 text-xs">
                {runResult.steps.map((step) => (
                  <li key={step.id} className="flex items-center justify-between gap-2">
                    <span>{step.label}</span>
                    <span className="font-mono uppercase text-slate-400">{step.status}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {runResult.summary ? (
              <div className="grid gap-1 border-t border-line pt-2 text-xs sm:grid-cols-2">
                <p>{runResult.summary.symbolsScanned} symbols scanned</p>
                <p>{runResult.summary.opportunitiesFound} opportunities found</p>
                <p>{runResult.summary.qualifiedSignals} qualified signal(s)</p>
                <p>{runResult.summary.tradesCreated} trade(s) created</p>
                <p>{runResult.summary.signalsRejected} signal(s) rejected</p>
                {runResult.summary.highestRejectionReason ? (
                  <p className="sm:col-span-2 text-amber-200">
                    Highest rejection: {runResult.summary.highestRejectionReason}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
