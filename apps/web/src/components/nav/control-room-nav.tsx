"use client";

import {
  BriefcaseBusiness,
  CandlestickChart,
  Home,
  Settings2,
  Sparkles
} from "lucide-react";
import type { ReactElement } from "react";

export type ControlRoomTab =
  | "home"
  | "signals"
  | "trade"
  | "portfolio"
  | "settings"
  | "market"
  | "strategies"
  | "risk"
  | "lab"
  | "admin";

const primaryTabs: readonly {
  readonly id: ControlRoomTab;
  readonly label: string;
  readonly icon: typeof Home;
  readonly testId: string;
}[] = [
  { id: "home", label: "Home", icon: Home, testId: "tab-home" },
  { id: "signals", label: "Signals", icon: Sparkles, testId: "tab-signals" },
  { id: "trade", label: "Trade", icon: CandlestickChart, testId: "tab-trade" },
  { id: "portfolio", label: "Portfolio", icon: BriefcaseBusiness, testId: "tab-portfolio" },
  { id: "settings", label: "Settings", icon: Settings2, testId: "tab-settings" }
];

export function BottomNav({
  activeTab,
  onChange,
  showAdmin
}: {
  readonly activeTab: ControlRoomTab;
  readonly onChange: (tab: ControlRoomTab) => void;
  readonly showAdmin?: boolean;
}): ReactElement {
  const mappedActive =
    activeTab === "market" ||
    activeTab === "strategies" ||
    activeTab === "risk" ||
    activeTab === "lab" ||
    activeTab === "admin"
      ? "settings"
      : activeTab;

  return (
    <nav
      aria-label="Primary"
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-obsidian-deepest/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 gap-0 px-1 pt-1">
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const active = mappedActive === tab.id;
          return (
            <li key={tab.id}>
              <button
                type="button"
                data-testid={tab.testId}
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(tab.id)}
                className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium ${
                  active ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {showAdmin ? (
        <span className="sr-only" data-testid="tab-admin-available">
          Admin available in settings
        </span>
      ) : null}
    </nav>
  );
}

export function DesktopNav({
  activeTab,
  onChange,
  tabs
}: {
  readonly activeTab: ControlRoomTab;
  readonly onChange: (tab: ControlRoomTab) => void;
  readonly tabs: readonly {
    readonly id: ControlRoomTab;
    readonly label: string;
    readonly testId: string;
    readonly icon: ReactElement;
  }[];
}): ReactElement {
  return (
    <nav
      aria-label="Terminal views"
      className="mb-5 hidden gap-1 overflow-x-auto border-b border-line pb-2 md:flex"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-testid={tab.testId}
          type="button"
          onClick={() => onChange(tab.id)}
          aria-current={activeTab === tab.id ? "page" : undefined}
          className={`flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm ${
            activeTab === tab.id
              ? "bg-emerald-500 text-slate-950"
              : "border border-line bg-surface text-slate-300"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
