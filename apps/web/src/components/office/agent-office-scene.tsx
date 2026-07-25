"use client";

import type { CSSProperties, ReactElement } from "react";
import {
  OFFICE_DESK_LAYOUT,
  OFFICE_MEETING,
  OFFICE_ROLES,
  type OfficeAgentState,
  type OfficeRole,
  type OfficeWorld
} from "./office-types";
import {
  FLOW_PIPELINE,
  meetingOccupied,
  resolveActiveFlowHops,
  resolvePose,
  statusBubbleText,
  type OfficePose
} from "./office-pose";

const ROLE_SHORT: Record<OfficeRole, string> = {
  coordinator: "COORD",
  signal: "SIGNAL",
  brain: "BRAIN",
  risk: "RISK",
  broker: "BROKER",
  portfolio: "BOOK"
};

function MonitorFace({
  role,
  active
}: {
  readonly role: OfficeRole;
  readonly active: boolean;
}): ReactElement {
  if (role === "signal") {
    return (
      <span className="office-screen office-screen--ticker" data-active={active ? "true" : "false"}>
        <span /><span /><span /><span />
      </span>
    );
  }
  if (role === "brain") {
    return (
      <span className="office-screen office-screen--nodes" data-active={active ? "true" : "false"}>
        <i /><i /><i />
      </span>
    );
  }
  if (role === "risk") {
    return (
      <span className="office-screen office-screen--gauge" data-active={active ? "true" : "false"}>
        <em />
      </span>
    );
  }
  if (role === "broker") {
    return (
      <span className="office-screen office-screen--order" data-active={active ? "true" : "false"}>
        <b /><b /><b />
      </span>
    );
  }
  if (role === "portfolio") {
    return (
      <span className="office-screen office-screen--bars" data-active={active ? "true" : "false"}>
        <span /><span /><span /><span /><span />
      </span>
    );
  }
  return (
    <span className="office-screen office-screen--ops" data-active={active ? "true" : "false"}>
      <span /><span />
    </span>
  );
}

function Workstation({
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
  const hot = agent.status === "working" || agent.status === "waiting";
  const danger = agent.status === "alert" || agent.status === "error";

  return (
    <button
      type="button"
      className="office-station"
      style={{ left: `${layout.left}%`, top: `${layout.top}%` }}
      data-role={role}
      data-status={agent.status}
      data-selected={selected ? "true" : "false"}
      data-testid={`office-desk-${role}`}
      aria-label={`${agent.label} workstation, ${agent.status}`}
      onClick={() => onSelect(role)}
    >
      {danger ? <span className="office-station__beacon" aria-hidden="true" /> : null}
      {hot ? <span className="office-station__halo" aria-hidden="true" /> : null}

      <div className="office-station__gear" data-role={role}>
        {role === "signal" ? (
          <>
            <div className="office-station__tower">
              <MonitorFace role={role} active={hot} />
            </div>
            <div className="office-station__desk office-station__desk--wide" />
            <div className="office-station__scanner" data-on={hot ? "true" : "false"} />
          </>
        ) : null}

        {role === "brain" ? (
          <>
            <div className="office-station__monitors office-station__monitors--triple">
              <div className="office-station__monitor"><MonitorFace role={role} active={hot} /></div>
              <div className="office-station__monitor office-station__monitor--main"><MonitorFace role={role} active={hot} /></div>
              <div className="office-station__monitor"><MonitorFace role={role} active={hot} /></div>
            </div>
            <div className="office-station__desk" />
            <div className="office-station__chair" />
          </>
        ) : null}

        {role === "risk" ? (
          <>
            <div className="office-station__monitors">
              <div className="office-station__monitor office-station__monitor--main"><MonitorFace role={role} active={hot || danger} /></div>
              <div className="office-station__safe" data-lock={danger ? "true" : "false"} />
            </div>
            <div className="office-station__desk office-station__desk--steel" />
            <div className="office-station__chair" />
          </>
        ) : null}

        {role === "broker" ? (
          <>
            <div className="office-station__monitors office-station__monitors--stack">
              <div className="office-station__monitor office-station__monitor--main"><MonitorFace role={role} active={hot} /></div>
              <div className="office-station__terminal" data-on={hot ? "true" : "false"} />
            </div>
            <div className="office-station__desk office-station__desk--terminal" />
            <div className="office-station__chair office-station__chair--stool" />
          </>
        ) : null}

        {role === "portfolio" ? (
          <>
            <div className="office-station__wallboard" data-on={hot ? "true" : "false"}>
              <MonitorFace role={role} active={hot} />
            </div>
            <div className="office-station__desk office-station__desk--ledger" />
            <div className="office-station__chair" />
          </>
        ) : null}

        {role === "coordinator" ? (
          <>
            <div className="office-station__monitors">
              <div className="office-station__monitor office-station__monitor--main"><MonitorFace role={role} active={hot} /></div>
            </div>
            <div className="office-station__desk office-station__desk--command" />
            <div className="office-station__flag" />
          </>
        ) : null}
      </div>

      <p className="office-station__label">
        <span>{ROLE_SHORT[role]}</span>
        <span data-status={agent.status}>{agent.status}</span>
      </p>
    </button>
  );
}

function AgentSprite({
  role,
  agent,
  left,
  top,
  pose,
  onSelect
}: {
  readonly role: OfficeRole;
  readonly agent: OfficeAgentState;
  readonly left: number;
  readonly top: number;
  readonly pose: OfficePose;
  readonly onSelect: (role: OfficeRole) => void;
}): ReactElement {
  const bubble = statusBubbleText(agent.status, agent.activity);
  const style = { left: `${left}%`, top: `${top}%` } as CSSProperties;

  return (
    <button
      type="button"
      className="office-actor"
      style={style}
      data-role={role}
      data-status={agent.status}
      data-pose={pose}
      data-testid={`office-agent-${role}`}
      aria-label={`${agent.label}, ${agent.status}: ${agent.activity}`}
      onClick={() => onSelect(role)}
    >
      {bubble ? (
        <span className="office-actor__bubble" data-tone={agent.status} aria-hidden="true">
          {bubble}
        </span>
      ) : null}
      {pose === "think" ? <span className="office-actor__dots" aria-hidden="true"><i /><i /><i /></span> : null}
      <span className="office-actor__sprite">
        <span className="office-actor__head" />
        <span className="office-actor__body" />
        <span className="office-actor__legs">
          <span /><span />
        </span>
      </span>
    </button>
  );
}

function OfficeDecor({ night }: { readonly night: boolean }): ReactElement {
  return (
    <div className="office-decor" aria-hidden="true">
      <div className="office-decor__wall-left" />
      <div className="office-decor__wall-right" />
      <div className="office-decor__back-wall" />
      <div className="office-decor__window" data-night={night ? "true" : "false"} />
      <div className="office-decor__server" style={{ left: "4%", top: "38%" }}>
        <span /><span /><span /><span />
      </div>
      <div className="office-decor__server" style={{ left: "4%", top: "58%" }}>
        <span /><span /><span /><span />
      </div>
      <div className="office-decor__shelf" style={{ left: "92%", top: "40%" }} />
      <div className="office-decor__shelf" style={{ left: "92%", top: "55%" }} />
      <div className="office-decor__plant" style={{ left: "8%", top: "18%" }} />
      <div className="office-decor__plant office-decor__plant--tall" style={{ left: "93%", top: "78%" }} />
      <div className="office-decor__plant" style={{ left: "35%", top: "86%" }} />
      <div className="office-decor__ticker">
        <div className="office-decor__ticker-track">
          <span>AAPL · SCAN</span>
          <span>RISK · GATE</span>
          <span>BROKER · PAPER</span>
          <span>BOOK · MARKS</span>
          <span>SIGNAL → BRAIN → RISK → BROKER → BOOK</span>
        </div>
      </div>
      <div className="office-decor__cable office-decor__cable--a" />
      <div className="office-decor__cable office-decor__cable--b" />
      <div className="office-decor__cable office-decor__cable--c" />
      <div className="office-decor__rug" />
    </div>
  );
}

function MeetingTable({
  occupied,
  onSelect
}: {
  readonly occupied: boolean;
  readonly onSelect: (role: OfficeRole) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="office-meeting"
      style={{ left: `${OFFICE_MEETING.left}%`, top: `${OFFICE_MEETING.top}%` }}
      data-occupied={occupied ? "true" : "false"}
      data-testid="office-meeting"
      aria-label="Collaboration table"
      onClick={() => onSelect("coordinator")}
    >
      <div className="office-meeting__table">
        <div className="office-meeting__screen" data-on={occupied ? "true" : "false"}>
          <span /><span /><span />
        </div>
      </div>
      <div className="office-meeting__seats">
        <i /><i /><i /><i />
      </div>
      <p className="office-meeting__label">HUDDLE</p>
    </button>
  );
}

function FlowOverlay({ world }: { readonly world: OfficeWorld }): ReactElement {
  const hops = resolveActiveFlowHops(world);
  const points = FLOW_PIPELINE.map((role) => OFFICE_DESK_LAYOUT[role]);

  return (
    <svg className="office-flow" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        className="office-flow__base"
        points={points.map((point) => `${point.left},${point.top}`).join(" ")}
        fill="none"
      />
      {hops.map((hop, index) => {
        if (!hop.active) {
          return null;
        }
        const from = OFFICE_DESK_LAYOUT[hop.from];
        const to = OFFICE_DESK_LAYOUT[hop.to];
        return (
          <line
            key={`${hop.from}-${hop.to}`}
            className="office-flow__pulse"
            x1={from.left}
            y1={from.top}
            x2={to.left}
            y2={to.top}
            style={{ animationDelay: `${index * 0.15}s` }}
          />
        );
      })}
      {points.map((point, index) => (
        <circle
          key={`node-${FLOW_PIPELINE[index]}`}
          className="office-flow__node"
          cx={point.left}
          cy={point.top}
          r="1.1"
          data-on={world.agents[FLOW_PIPELINE[index] as OfficeRole].status !== "idle" ? "true" : "false"}
        />
      ))}
    </svg>
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
  const occupied = meetingOccupied(world);
  const coordinatorAway = world.coordinatorAt !== "coordinator";

  return (
    <div className="office-scene-wrap" data-testid="office-scene">
      <div className="office-scene-scroller">
        <div
          className="office-scene"
          data-level={world.lifestyleLevel}
          data-night={world.night ? "true" : "false"}
          role="group"
          aria-label="Dondie agent office"
        >
          <div className="office-scene__pixel" aria-hidden="true" />
          <div className="office-scene__ambient" aria-hidden="true" />
          <OfficeDecor night={world.night} />
          <FlowOverlay world={world} />

          <MeetingTable occupied={occupied} onSelect={onSelectRole} />

          {OFFICE_ROLES.map((role) => (
            <Workstation
              key={`desk-${role}`}
              role={role}
              agent={world.agents[role]}
              selected={selectedRole === role}
              onSelect={onSelectRole}
            />
          ))}

          {OFFICE_ROLES.filter((role) => role !== "coordinator").map((role) => {
            const layout = OFFICE_DESK_LAYOUT[role];
            const agent = world.agents[role];
            const atMeeting =
              occupied &&
              (agent.status === "working" || agent.status === "waiting") &&
              (role === "brain" || role === "risk");
            return (
              <AgentSprite
                key={`agent-${role}`}
                role={role}
                agent={agent}
                left={atMeeting ? OFFICE_MEETING.left + (role === "brain" ? -6 : 6) : layout.left}
                top={atMeeting ? OFFICE_MEETING.top + 4 : layout.top - 8}
                pose={resolvePose(agent)}
                onSelect={onSelectRole}
              />
            );
          })}

          <AgentSprite
            role="coordinator"
            agent={world.agents.coordinator}
            left={
              occupied
                ? OFFICE_MEETING.left
                : OFFICE_DESK_LAYOUT[world.coordinatorAt].left + (coordinatorAway ? 5 : 0)
            }
            top={
              occupied
                ? OFFICE_MEETING.top - 6
                : OFFICE_DESK_LAYOUT[world.coordinatorAt].top - (coordinatorAway ? 6 : 8)
            }
            pose={resolvePose(world.agents.coordinator, coordinatorAway && !occupied)}
            onSelect={onSelectRole}
          />

          <div className="office-legend" aria-hidden="true">
            <span>SIGNAL</span>
            <span>→</span>
            <span>BRAIN</span>
            <span>→</span>
            <span>RISK</span>
            <span>→</span>
            <span>BROKER</span>
            <span>→</span>
            <span>BOOK</span>
          </div>

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
              Start hands-off from COORD — agent picks strategy. Fund in Alpaca.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
