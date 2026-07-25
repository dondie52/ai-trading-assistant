import type { ReactElement, ReactNode } from "react";

export function Panel({
  title,
  icon,
  children,
  action,
  compact = false
}: {
  readonly title: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly compact?: boolean;
}): ReactElement {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-xl border border-line bg-panel/90 shadow-xl ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 sm:tracking-[0.16em]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  tone,
  hint
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly tone: "emerald" | "violet" | "cyan" | "amber" | "rose";
  readonly hint?: string;
}): ReactElement {
  const toneClass = {
    emerald: "text-emerald-300 border-emerald-400/30",
    violet: "text-violet-300 border-violet-400/30",
    cyan: "text-cyan-300 border-cyan-400/30",
    amber: "text-amber-300 border-amber-400/30",
    rose: "text-rose-300 border-rose-400/30"
  }[tone];

  return (
    <div className={`rounded-xl border bg-white/[0.035] p-3 ${toneClass}`}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-white/5 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white sm:text-xl">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SmallStat({
  label,
  value,
  empty
}: {
  readonly label: string;
  readonly value: string;
  readonly empty?: boolean;
}): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-base ${empty ? "text-slate-500" : "text-white"}`}>{value}</p>
    </div>
  );
}

export function EmptyLine({ text }: { readonly text: string }): ReactElement {
  return <p className="rounded-lg border border-dashed border-line px-3 py-4 text-sm text-slate-500">{text}</p>;
}

export function RiskRow({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="font-mono text-sm text-white">{value}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { readonly className?: string }): ReactElement {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} aria-hidden="true" />;
}

export function StatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: "emerald" | "rose" | "amber" | "violet" | "cyan" | "slate";
}): ReactElement {
  const tones = {
    emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    rose: "border-rose-400/40 bg-rose-400/10 text-rose-200",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-100",
    violet: "border-violet-400/40 bg-violet-400/10 text-violet-200",
    cyan: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
    slate: "border-line bg-white/5 text-slate-300"
  } as const;
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium ${tones[tone]}`}>
      {label}
    </span>
  );
}
