"use client";

import { BedDouble, Brain, ChevronRight, Sparkles, Wallet } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import type { DondieLifestyleWorld } from "@trading/types";
import { formatCurrency } from "../../lib/format";
import { Panel, StatusPill } from "../ui/primitives";
import { DondieScene } from "./dondie-scene";

const moodTone: Record<
  DondieLifestyleWorld["mood"],
  "emerald" | "amber" | "rose" | "violet" | "cyan" | "slate"
> = {
  focused: "cyan",
  calm: "slate",
  tired: "amber",
  optimistic: "emerald",
  cautious: "amber",
  blocked: "rose",
  celebrating: "emerald",
  waiting: "violet"
};

export function DondieRoomPanel({
  world,
  loading,
  onOpenTimeline
}: {
  readonly world?: DondieLifestyleWorld | null;
  readonly loading?: boolean;
  readonly onOpenTimeline?: () => void;
}): ReactElement {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [showRoadmap, setShowRoadmap] = useState(false);

  if (loading && !world) {
    return (
      <Panel title="Dondie Room" icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />} compact>
        <div data-testid="dondie-room-loading" className="h-40 animate-pulse rounded-xl bg-white/5" />
      </Panel>
    );
  }

  if (!world) {
    return (
      <Panel title="Dondie Room" icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />} compact>
        <p className="text-sm text-slate-400">Activate Dondie to open his survival office.</p>
      </Panel>
    );
  }

  const unlockedAchievements = world.achievements.filter((item) => item.unlocked);

  return (
    <Panel
      title="Dondie Room"
      icon={<Sparkles className="h-5 w-5 text-violet-300" aria-hidden="true" />}
      compact
      action={<StatusPill label={world.lifestyleLabel} tone="violet" />}
    >
      <div data-testid="dondie-room" className="space-y-4">
        <DondieScene world={world} onSelectItem={setSelectedItem} />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetaChip icon={<Wallet className="h-3.5 w-3.5" />} label="Cognition wallet" value={formatCurrency(world.walletBalance)} hint="Not trading equity" />
          <MetaChip icon={<Brain className="h-3.5 w-3.5" />} label="Brain tier" value={world.brainTier} hint="Model access" />
          <MetaChip icon={<BedDouble className="h-3.5 w-3.5" />} label="Mood" value={world.mood} hint={world.activityLabel} />
          <MetaChip
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="Paper label"
            value={world.paperTradingLabel}
            hint="Simulated unless live enabled"
          />
        </div>

        <div className="rounded-xl border border-line bg-surface px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Current task</p>
              <p data-testid="dondie-current-task" className="mt-1 text-sm text-slate-100">
                {world.currentTask}
              </p>
            </div>
            <StatusPill label={world.mood} tone={moodTone[world.mood]} />
          </div>
          <p className="mt-2 text-xs text-slate-400">{world.lastEventSummary}</p>
          {world.lastTradeResult ? (
            <p className="mt-1 text-xs text-slate-400">
              Last paper close: {world.lastTradeResult.symbol}{" "}
              <span className={world.lastTradeResult.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                {formatCurrency(world.lastTradeResult.pnl)}
              </span>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          data-testid="dondie-upgrade-progress"
          className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-3 text-left"
          onClick={() => setShowRoadmap((value) => !value)}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next upgrade</p>
            <ChevronRight className={`h-4 w-4 text-slate-400 transition ${showRoadmap ? "rotate-90" : ""}`} />
          </div>
          <p className="mt-1 text-sm text-slate-200">{world.nextUnlock.label}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-violetSignal transition-all"
              style={{ width: `${world.nextUnlock.progressPercent}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-[11px] text-slate-400">{world.nextUnlock.progressPercent}% toward next lifestyle tier</p>
        </button>

        {showRoadmap ? (
          <div data-testid="dondie-roadmap" className="grid gap-2 sm:grid-cols-5">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`rounded-lg border px-2 py-2 text-center text-xs ${
                  world.lifestyleLevel >= level
                    ? "border-violet-400/40 bg-violet-500/10 text-violet-100"
                    : "border-line bg-surface text-slate-500"
                }`}
              >
                L{level}
              </div>
            ))}
          </div>
        ) : null}

        {selectedItem ? (
          <div data-testid="dondie-item-detail" className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-50">
            Selected: {selectedItem}. Room tiers unlock with cognition wallet growth and disciplined paper progress — not with reckless size.
            <button type="button" className="ml-2 underline" onClick={() => setSelectedItem(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Achievements</p>
            {onOpenTimeline ? (
              <button type="button" className="text-xs text-violet-200 underline" onClick={onOpenTimeline}>
                View timeline
              </button>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {world.achievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  achievement.unlocked
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-50"
                    : "border-line bg-surface text-slate-500"
                }`}
              >
                <p className="font-medium">{achievement.title}</p>
                <p className="mt-1 opacity-80">{achievement.description}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {unlockedAchievements.length}/{world.achievements.length} unlocked · rewards consistency and risk discipline
          </p>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">{world.disclaimer}</p>
      </div>
    </Panel>
  );
}

function MetaChip({
  icon,
  label,
  value,
  hint
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-1 font-mono text-sm text-white">{value}</p>
      <p className="text-[10px] text-slate-500">{hint}</p>
    </div>
  );
}
