"use client";

import type { ReactElement } from "react";
import { OfficeChat } from "./office-chat";
import type { OfficeAgentState, OfficeRole, OfficeTimelineEntry, OfficeWorld } from "./office-types";

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export type OfficeInspectorActions = {
  readonly onActivate?: () => void;
  readonly onPause?: () => void;
  readonly onResume?: () => void;
  readonly onRun?: () => void;
  readonly onOpenTab?: (tab: "signals" | "trade" | "portfolio" | "risk" | "settings") => void;
  readonly canActivate?: boolean;
  readonly busy?: boolean;
  readonly agentStatus?: "ACTIVE" | "PAUSED" | "SUSPENDED" | null;
};

function RoleControls({
  role,
  actions
}: {
  readonly role: OfficeRole;
  readonly actions: OfficeInspectorActions;
}): ReactElement | null {
  if (role === "coordinator") {
    const status = actions.agentStatus;
    return (
      <div className="office-inspector__actions">
        {!status ? (
          <button
            type="button"
            className="office-inspector__action"
            data-tone="primary"
            data-testid="office-activate"
            disabled={!actions.canActivate || actions.busy}
            onClick={actions.onActivate}
          >
            Start hands-off
          </button>
        ) : null}
        {status === "ACTIVE" ? (
          <>
            <button
              type="button"
              className="office-inspector__action"
              data-tone="primary"
              data-testid="office-run"
              disabled={actions.busy}
              onClick={actions.onRun}
            >
              Run now
            </button>
            <button
              type="button"
              className="office-inspector__action"
              data-testid="office-pause"
              disabled={actions.busy}
              onClick={actions.onPause}
            >
              Pause
            </button>
          </>
        ) : null}
        {status === "PAUSED" ? (
          <button
            type="button"
            className="office-inspector__action"
            data-tone="primary"
            data-testid="office-resume"
            disabled={actions.busy}
            onClick={actions.onResume}
          >
            Resume
          </button>
        ) : null}
      </div>
    );
  }

  const tab =
    role === "signal"
      ? "signals"
      : role === "broker" || role === "brain"
        ? "trade"
        : role === "portfolio"
          ? "portfolio"
          : role === "risk"
            ? "risk"
            : "settings";

  return (
    <div className="office-inspector__actions">
      <button
        type="button"
        className="office-inspector__action"
        data-testid={`office-open-${tab}`}
        onClick={() => actions.onOpenTab?.(tab)}
      >
        Open {tab}
      </button>
    </div>
  );
}

export function InspectorContent({
  agent,
  timeline,
  actions,
  onSpeechBubble
}: {
  readonly agent: OfficeAgentState;
  readonly timeline: readonly OfficeTimelineEntry[];
  readonly actions: OfficeInspectorActions;
  readonly onSpeechBubble?: ((text: string | null) => void) | undefined;
}): ReactElement {
  const roleTimeline = timeline.filter((entry) => entry.role === agent.role).slice(0, 5);
  const shownTimeline = roleTimeline.length > 0 ? roleTimeline : timeline.slice(0, 5);

  return (
    <div data-testid="office-inspector-content">
      <div className="office-inspector__title">{agent.label}</div>
      <div className="office-inspector__status">
        <span className="office-inspector__dot" data-status={agent.status} />
        {agent.status}
      </div>

      <div className="office-inspector__block">
        <p className="office-inspector__label">Current task</p>
        <p className="office-inspector__value" data-testid="office-current-task">
          {agent.activity}
        </p>
      </div>

      <div className="office-inspector__block">
        <p className="office-inspector__label">Last update</p>
        <p className="office-inspector__mono">{formatTime(agent.updatedAt)}</p>
      </div>

      {agent.relatedEntity ? (
        <div className="office-inspector__block">
          <p className="office-inspector__label">Related</p>
          <p className="office-inspector__mono">
            {agent.relatedEntity.type}:{agent.relatedEntity.id}
          </p>
        </div>
      ) : null}

      {agent.detailLines.length > 0 ? (
        <div className="office-inspector__block">
          <p className="office-inspector__label">Details</p>
          {agent.detailLines.map((line) => (
            <p key={line} className="office-inspector__mono">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <div className="office-inspector__block">
        <p className="office-inspector__label">Controls</p>
        <RoleControls role={agent.role} actions={actions} />
      </div>

      {agent.role === "coordinator" ? (
        <div className="office-inspector__block">
          <OfficeChat onSpeechBubble={onSpeechBubble} />
        </div>
      ) : null}

      <div className="office-inspector__block">
        <p className="office-inspector__label">Activity</p>
        <div className="office-timeline" data-testid="office-timeline">
          {shownTimeline.length === 0 ? (
            <p className="office-inspector__mono">No recent events.</p>
          ) : (
            shownTimeline.map((entry) => (
              <div key={entry.id} className="office-timeline__item">
                <p className="office-timeline__meta">
                  {formatTime(entry.at)} · {entry.role}
                </p>
                <p className="office-timeline__text">{entry.text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function OfficeInspector({
  world,
  selectedRole,
  collapsed,
  onToggleCollapsed,
  actions,
  onSpeechBubble
}: {
  readonly world: OfficeWorld;
  readonly selectedRole: OfficeRole | null;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly actions: OfficeInspectorActions;
  readonly onSpeechBubble?: ((text: string | null) => void) | undefined;
}): ReactElement {
  const role = selectedRole ?? "coordinator";
  const agent = world.agents[role];

  return (
    <aside className="office-inspector" data-testid="office-inspector" data-collapsed={collapsed ? "true" : "false"}>
      <button type="button" className="office-inspector__toggle" onClick={onToggleCollapsed}>
        {collapsed ? "Inspect" : "Inspector · collapse"}
      </button>
      {!collapsed ? (
        <div className="office-inspector__body">
          <InspectorContent
            agent={agent}
            timeline={world.timeline}
            actions={actions}
            onSpeechBubble={onSpeechBubble}
          />
        </div>
      ) : null}
    </aside>
  );
}
