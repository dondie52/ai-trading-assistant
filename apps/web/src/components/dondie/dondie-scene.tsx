"use client";

import type { CSSProperties, ReactElement } from "react";
import type { DondieActivityState, DondieLifestyleLevel, DondieLifestyleWorld } from "@trading/types";

const levelPalette: Record<
  DondieLifestyleLevel,
  { readonly wall: string; readonly floor: string; readonly accent: string; readonly glow: string }
> = {
  1: { wall: "#1a2233", floor: "#121826", accent: "#64748b", glow: "rgba(100,116,139,0.25)" },
  2: { wall: "#1b2740", floor: "#132033", accent: "#38bdf8", glow: "rgba(56,189,248,0.22)" },
  3: { wall: "#1c2438", floor: "#141c2e", accent: "#34d399", glow: "rgba(52,211,153,0.2)" },
  4: { wall: "#221b36", floor: "#171225", accent: "#a78bfa", glow: "rgba(167,139,250,0.25)" },
  5: { wall: "#1a2035", floor: "#10182a", accent: "#fbbf24", glow: "rgba(251,191,36,0.22)" }
};

const isSleeping = (activity: DondieActivityState): boolean =>
  activity === "SLEEPING" || activity === "RESTING" || activity === "MARKET_CLOSED";

const isAtDesk = (activity: DondieActivityState): boolean =>
  activity === "ANALYSING" ||
  activity === "THINKING" ||
  activity === "PREPARING_ORDER" ||
  activity === "AWAITING_CONFIRMATION" ||
  activity === "EXECUTING" ||
  activity === "MONITORING" ||
  activity === "IDLE" ||
  activity === "CELEBRATING" ||
  activity === "BLOCKED_BY_RISK" ||
  activity === "BROKER_DISCONNECTED" ||
  activity === "ERROR_RETRYING";

export function DondieScene({
  world,
  onSelectItem
}: {
  readonly world: DondieLifestyleWorld;
  readonly onSelectItem?: (item: string) => void;
}): ReactElement {
  const palette = levelPalette[world.lifestyleLevel];
  const sleeping = isSleeping(world.activity);
  const atDesk = isAtDesk(world.activity) && !sleeping;
  const celebrating = world.activity === "CELEBRATING";
  const blocked =
    world.activity === "BLOCKED_BY_RISK" ||
    world.activity === "BROKER_DISCONNECTED" ||
    world.activity === "ERROR_RETRYING";

  const style = {
    "--dondie-wall": palette.wall,
    "--dondie-floor": palette.floor,
    "--dondie-accent": palette.accent,
    "--dondie-glow": palette.glow
  } as CSSProperties;

  return (
    <div
      data-testid="dondie-scene"
      className="relative overflow-hidden rounded-xl border border-line"
      style={style}
      role="img"
      aria-label={`Dondie lifestyle level ${world.lifestyleLevel}, currently ${world.activityLabel}`}
    >
      <div
        className="relative aspect-[16/10] w-full sm:aspect-[2/1]"
        style={{
          background: `linear-gradient(180deg, ${palette.wall} 0%, ${palette.wall} 58%, ${palette.floor} 58%, ${palette.floor} 100%)`
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-70"
          style={{
            background: `radial-gradient(ellipse at top, ${palette.glow}, transparent 70%)`
          }}
        />

        {/* Window */}
        <button
          type="button"
          className="absolute right-4 top-4 h-14 w-12 rounded-md border border-white/15 bg-sky-900/40 sm:right-8 sm:h-16 sm:w-14"
          onClick={() => onSelectItem?.("lighting")}
          aria-label={`Lighting tier ${world.room.lighting}`}
        >
          <span className="absolute inset-1 rounded-sm bg-gradient-to-b from-sky-300/30 to-indigo-900/40" />
          {world.lifestyleLevel >= 3 ? (
            <span className="absolute bottom-1 left-1 right-1 h-1 rounded-full bg-emerald-300/40" />
          ) : null}
        </button>

        {/* Bed / rest area */}
        <button
          type="button"
          className="absolute bottom-[18%] left-3 w-[28%] min-w-[88px] text-left sm:left-6"
          onClick={() => onSelectItem?.("bed")}
          aria-label={`Bed tier ${world.room.bed}`}
        >
          <div
            className={`rounded-md border border-white/10 p-1.5 ${
              world.room.bed >= 4 ? "bg-violet-500/20" : world.room.bed >= 2 ? "bg-slate-500/20" : "bg-slate-700/40"
            }`}
          >
            <div className="mb-1 h-2 w-6 rounded-sm bg-white/25" />
            <div className={`h-5 rounded-sm ${world.room.bed >= 3 ? "bg-violet-300/40" : "bg-slate-400/30"}`} />
          </div>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">Rest · L{world.room.bed}</p>
        </button>

        {/* Desk / workstation */}
        <button
          type="button"
          className="absolute bottom-[16%] right-3 w-[42%] min-w-[130px] text-left sm:right-8"
          onClick={() => onSelectItem?.("desk")}
          aria-label={`Desk tier ${world.room.desk}, monitors ${world.room.monitor}`}
        >
          <div className="flex items-end justify-center gap-1">
            {Array.from({ length: Math.min(3, world.room.monitor) }).map((_, index) => (
              <div
                key={`monitor-${index}`}
                className={`rounded-sm border border-cyan-300/30 ${
                  index === 0 ? "h-10 w-12" : "h-8 w-9"
                }`}
                style={{
                  background:
                    celebrating
                      ? "linear-gradient(180deg, rgba(52,211,153,0.45), rgba(15,23,42,0.8))"
                      : blocked
                        ? "linear-gradient(180deg, rgba(244,63,94,0.35), rgba(15,23,42,0.85))"
                        : "linear-gradient(180deg, rgba(56,189,248,0.35), rgba(15,23,42,0.85))"
                }}
              />
            ))}
          </div>
          <div
            className={`mt-1 h-3 rounded-sm border border-white/10 ${
              world.room.desk >= 4 ? "bg-amber-200/20" : "bg-slate-500/30"
            }`}
          />
          <div className="mx-auto mt-0.5 h-4 w-10 rounded-sm border border-white/10 bg-slate-600/40" />
          <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
            Desk L{world.room.desk} · Screens L{world.room.monitor}
          </p>
        </button>

        {/* Safe / wallet */}
        <button
          type="button"
          className="absolute bottom-[42%] left-[36%] rounded-md border border-amber-300/30 bg-amber-500/10 px-2 py-1"
          onClick={() => onSelectItem?.("wallet")}
          aria-label="Cognition wallet"
        >
          <p className="font-mono text-[10px] text-amber-100">${world.walletBalance.toFixed(0)}</p>
        </button>

        {/* Decor */}
        {world.room.decor >= 2 ? (
          <button
            type="button"
            className="absolute bottom-[38%] right-[48%] h-8 w-4 rounded-full bg-emerald-500/30"
            onClick={() => onSelectItem?.("decor")}
            aria-label={`Decor tier ${world.room.decor}`}
          >
            <span className="absolute -top-2 left-0 right-0 mx-auto h-3 w-3 rounded-full bg-emerald-400/50" />
          </button>
        ) : null}

        {/* Dondie character */}
        <div
          data-testid="dondie-character"
          className={`absolute transition-all duration-500 ${
            sleeping ? "bottom-[22%] left-[8%]" : "bottom-[28%] right-[18%] sm:right-[22%]"
          }`}
        >
          <DondieAvatar
            activity={world.activity}
            celebrating={celebrating}
            blocked={blocked}
            atDesk={atDesk}
            level={world.lifestyleLevel}
          />
        </div>

        {/* Energy / coffee */}
        {world.lifestyleLevel >= 2 && atDesk ? (
          <div className="absolute bottom-[34%] right-[8%] h-3 w-2 rounded-sm bg-amber-700/70 sm:right-[12%]">
            <span className="absolute -top-1 left-0 right-0 mx-auto h-1 w-1 rounded-full bg-slate-200/50" />
          </div>
        ) : null}

        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
            {world.activityLabel}
          </span>
          <span className="rounded-md border border-white/10 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
            {world.paperTradingLabel} mode
          </span>
        </div>
      </div>
    </div>
  );
}

function DondieAvatar({
  activity,
  celebrating,
  blocked,
  atDesk,
  level
}: {
  readonly activity: DondieActivityState;
  readonly celebrating: boolean;
  readonly blocked: boolean;
  readonly atDesk: boolean;
  readonly level: DondieLifestyleLevel;
}): ReactElement {
  const body =
    level >= 5 ? "bg-violet-300" : level >= 3 ? "bg-cyan-300" : level >= 2 ? "bg-emerald-300" : "bg-slate-300";
  const face = blocked ? "bg-rose-300" : celebrating ? "bg-amber-200" : "bg-violet-100";

  return (
    <div className="relative flex flex-col items-center">
      {celebrating ? (
        <span className="absolute -top-3 text-[10px] text-amber-200" aria-hidden="true">
          ✦
        </span>
      ) : null}
      <div className={`h-4 w-4 rounded-full border border-white/20 ${face}`} />
      <div className={`mt-0.5 h-6 w-5 rounded-md border border-white/15 ${body}`} />
      {atDesk ? (
        <div className="mt-0.5 flex gap-1">
          <span className={`h-3 w-1.5 rounded-sm ${body}`} />
          <span className={`h-3 w-1.5 rounded-sm ${body}`} />
        </div>
      ) : (
        <div className={`mt-0.5 h-2 w-6 rounded-sm ${body} opacity-80`} />
      )}
      <span className="sr-only">{activity}</span>
    </div>
  );
}
