"use client";

import type { ReactElement } from "react";
import {
  OFFICE_DESK_LAYOUT,
  OFFICE_ROLES,
  type OfficeAgentState,
  type OfficeAgentStatus,
  type OfficeRole,
  type OfficeWorld
} from "./office-types";

const statusBubble = (status: OfficeAgentStatus): string => {
  switch (status) {
    case "working":
      return "work";
    case "waiting":
      return "wait";
    case "alert":
      return "alert";
    case "error":
      return "err";
    case "offline":
      return "off";
    case "idle":
    default:
      return "";
  }
};

function Desk({
  role,
  agent,
  selected,
  onSelect
}: {
  readonly role: OfficeRole;
  readonly agent: OfficeAgentState;
  readonly selected: boolean;
  readonly onSelect: (role: OfficeRole) => void;
}): ReactElement {
  const layout = OFFICE_DESK_LAYOUT[role];
  const showBeacon = agent.status === "alert" || agent.status === "error";

  return (
    <button
      type="button"
      className="office-desk"
      style={{ left: `${layout.left}%`, top: `${layout.top}%` }}
      data-role={role}
      data-status={agent.status}
      data-selected={selected ? "true" : "false"}
      data-testid={`office-desk-${role}`}
      aria-label={`${agent.label} workstation, ${agent.status}`}
      onClick={() => onSelect(role)}
    >
      {showBeacon ? <span className="office-desk__beacon" aria-hidden="true" /> : null}
      <div className="office-desk__surface">
        <div className="office-desk__monitor">
          <span className="office-desk__monitor-screen" />
        </div>
      </div>
      <p className="office-desk__label">{agent.label}</p>
    </button>
  );
}

function AgentSprite({
  role,
  agent,
  left,
  top,
  onSelect
}: {
  readonly role: OfficeRole;
  readonly agent: OfficeAgentState;
  readonly left: number;
  readonly top: number;
  readonly onSelect: (role: OfficeRole) => void;
}): ReactElement {
  const bubble = statusBubble(agent.status);

  return (
    <button
      type="button"
      className="office-agent"
      style={{ left: `${left}%`, top: `${top - 6}%` }}
      data-role={role}
      data-status={agent.status}
      data-testid={`office-agent-${role}`}
      aria-label={`${agent.label}, ${agent.status}: ${agent.activity}`}
      onClick={() => onSelect(role)}
    >
      {bubble ? (
        <span className="office-agent__bubble" data-tone={agent.status} aria-hidden="true">
          {bubble}
        </span>
      ) : null}
      <span className="office-agent__sprite">
        <span className="office-agent__head" />
        <span className="office-agent__body" />
      </span>
    </button>
  );
}

export function AgentOfficeScene({
  world,
  selectedRole,
  onSelectRole
}: {
  readonly world: OfficeWorld;
  readonly selectedRole: OfficeRole | null;
  readonly onSelectRole: (role: OfficeRole) => void;
}): ReactElement {
  return (
    <div className="office-scene-wrap" data-testid="office-scene">
      <div className="office-scene-scroller">
        <div
          className="office-scene"
          data-level={world.lifestyleLevel}
          role="group"
          aria-label="Dondie agent office"
        >
          <div className="office-scene__pixel" aria-hidden="true" />
          <div className="office-scene__ambient" aria-hidden="true" />

          {OFFICE_ROLES.map((role) => (
            <Desk
              key={`desk-${role}`}
              role={role}
              agent={world.agents[role]}
              selected={selectedRole === role}
              onSelect={onSelectRole}
            />
          ))}

          {OFFICE_ROLES.filter((role) => role !== "coordinator").map((role) => {
            const layout = OFFICE_DESK_LAYOUT[role];
            return (
              <AgentSprite
                key={`agent-${role}`}
                role={role}
                agent={world.agents[role]}
                left={layout.left}
                top={layout.top}
                onSelect={onSelectRole}
              />
            );
          })}

          <AgentSprite
            role="coordinator"
            agent={world.agents.coordinator}
            left={OFFICE_DESK_LAYOUT[world.coordinatorAt].left + 4}
            top={OFFICE_DESK_LAYOUT[world.coordinatorAt].top + 2}
            onSelect={onSelectRole}
          />

          {world.loading ? (
            <div className="office-empty" data-testid="office-loading">
              Syncing office state…
            </div>
          ) : null}
          {world.error ? (
            <div className="office-error" data-testid="office-error">
              {world.error}
            </div>
          ) : null}
          {!world.loading && !world.error && !world.agentActive ? (
            <div className="office-empty" data-testid="office-inactive">
              Activate Dondie to staff the office. Select Coordinator for controls.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
