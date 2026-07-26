"use client";

import { useMemo, useState, type ReactElement } from "react";
import type {
  AutomationRunResult,
  AutomationSettings,
  BrokerAccountView,
  DondieAgent,
  DondieLifestyleWorld,
  DondieMemory,
  Order,
  Portfolio,
  Position,
  RiskRules,
  Signal,
  Trade
} from "@trading/types";
import { AgentOfficeScene } from "./agent-office-scene";
import { OfficeBottomSheet } from "./office-bottom-sheet";
import { OfficeInspector, type OfficeInspectorActions } from "./office-inspector";
import { buildOfficeWorld } from "./office-state-adapter";
import type { OfficeRole } from "./office-types";
import "./office.css";

export function OfficeConsole({
  agent,
  lifestyle,
  automation,
  lastAutomationRun,
  signals,
  orders,
  trades,
  positions,
  portfolio,
  risk,
  brokers,
  memories,
  realtimeConnected,
  loading,
  fetchError,
  userEmail,
  onLogout,
  onActivate,
  onPause,
  onResume,
  onRun,
  onOpenTab,
  canActivate,
  busy
}: {
  readonly agent?: DondieAgent | null;
  readonly lifestyle?: DondieLifestyleWorld | null;
  readonly automation?: AutomationSettings | null;
  readonly lastAutomationRun?: AutomationRunResult | null;
  readonly signals?: readonly Signal[];
  readonly orders?: readonly Order[];
  readonly trades?: readonly Trade[];
  readonly positions?: readonly Position[];
  readonly portfolio?: Portfolio | null;
  readonly risk?: RiskRules | null;
  readonly brokers?: readonly BrokerAccountView[];
  readonly memories?: readonly DondieMemory[];
  readonly realtimeConnected: boolean;
  readonly loading?: boolean;
  readonly fetchError?: boolean;
  readonly userEmail?: string;
  readonly onLogout: () => void;
  readonly onActivate: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onRun: () => void;
  readonly onOpenTab: (tab: "signals" | "trade" | "portfolio" | "risk" | "settings") => void;
  readonly canActivate: boolean;
  readonly busy: boolean;
}): ReactElement {
  const [selectedRole, setSelectedRole] = useState<OfficeRole | null>("coordinator");
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [speechOverride, setSpeechOverride] = useState<string | null>(null);

  const world = useMemo(
    () =>
      buildOfficeWorld({
        agent: agent ?? null,
        lifestyle: lifestyle ?? null,
        automation: automation ?? null,
        lastAutomationRun: lastAutomationRun ?? null,
        signals: signals ?? [],
        orders: orders ?? [],
        trades: trades ?? [],
        positions: positions ?? [],
        portfolio: portfolio ?? null,
        risk: risk ?? null,
        brokers: brokers ?? [],
        memories: memories ?? [],
        realtimeConnected,
        loading: Boolean(loading),
        fetchError: Boolean(fetchError)
      }),
    [
      agent,
      lifestyle,
      automation,
      lastAutomationRun,
      signals,
      orders,
      trades,
      positions,
      portfolio,
      risk,
      brokers,
      memories,
      realtimeConnected,
      loading,
      fetchError
    ]
  );

  const actions: OfficeInspectorActions = {
    onActivate,
    onPause,
    onResume,
    onRun,
    onOpenTab,
    canActivate,
    busy,
    agentStatus: agent?.status ?? null
  };

  const connectionTone =
    world.connection === "live" ? "live" : world.connection === "offline" ? "offline" : "warn";

  const handleSelectRole = (role: OfficeRole): void => {
    setSelectedRole(role);
    setMobileSheetOpen(true);
    if (inspectorCollapsed) {
      setInspectorCollapsed(false);
    }
  };

  return (
    <div
      className="office-console"
      data-testid="office-console"
      data-night={world.night ? "true" : "false"}
      data-level={world.lifestyleLevel}
    >
      <div className="office-console__shell">
        <header className="office-console__topbar">
          <div className="flex min-w-0 items-center gap-2">
            <span className="office-console__brand">Dondie Ops</span>
            <span className="office-console__meta hidden sm:inline">Agent office</span>
          </div>
          <div className="office-console__meta">
            <span className="office-console__pill" data-tone={connectionTone} data-testid="office-connection">
              {world.connection === "live" ? "ws:live" : world.connection === "offline" ? "offline" : "polling"}
            </span>
            <span className="office-console__pill" data-tone={world.paperMode ? "warn" : "live"}>
              {world.paperMode ? "paper" : "live"}
            </span>
            <button type="button" className="office-console__account" onClick={onLogout} data-testid="office-logout">
              {userEmail ? `${userEmail.split("@")[0]} · out` : "Logout"}
            </button>
          </div>
        </header>

        <div
          className="office-console__workspace"
          data-inspector={inspectorCollapsed ? "collapsed" : "open"}
        >
          <AgentOfficeScene
            world={world}
            selectedRole={selectedRole}
            onSelectRole={handleSelectRole}
            speechOverride={speechOverride}
          />
          <OfficeInspector
            world={world}
            selectedRole={selectedRole}
            collapsed={inspectorCollapsed}
            onToggleCollapsed={() => setInspectorCollapsed((value) => !value)}
            actions={actions}
            onSpeechBubble={setSpeechOverride}
          />
        </div>
      </div>

      {mobileSheetOpen && selectedRole ? (
        <OfficeBottomSheet
          world={world}
          selectedRole={selectedRole}
          onClose={() => setMobileSheetOpen(false)}
          actions={actions}
          onSpeechBubble={setSpeechOverride}
        />
      ) : null}
    </div>
  );
}
