"use client";

import type { CSSProperties, ReactElement } from "react";
import type { OfficeAgentState, OfficeRole, OfficeWorld } from "./office-types";
import { resolvePose, statusBubbleText, type OfficePose } from "./office-pose";

const DESK = { left: 50, top: 54 } as const;

function deskPose(agent: OfficeAgentState): OfficePose {
  const pose = resolvePose(agent);
  return pose === "stand" || pose === "walk" ? "sit" : pose;
}

function LaptopDesk({
  agent,
  selected,
  onSelect
}: {
  readonly agent: OfficeAgentState;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): ReactElement {
  const hot = agent.status === "working" || agent.status === "waiting";
  const danger = agent.status === "alert" || agent.status === "error";

  return (
    <button
      type="button"
      className="office-desk"
      style={{ left: `${DESK.left}%`, top: `${DESK.top}%` }}
      data-status={agent.status}
      data-selected={selected ? "true" : "false"}
      data-testid="office-desk-coordinator"
      aria-label={`${agent.label} desk, ${agent.status}`}
      onClick={onSelect}
    >
      {danger ? <span className="office-desk__beacon" aria-hidden="true" /> : null}
      {hot ? <span className="office-desk__halo" aria-hidden="true" /> : null}

      <div className="office-desk__gear">
        <div className="office-desk__table">
          <div className="office-desk__laptop" data-on={hot ? "true" : "false"}>
            <span className="office-desk__laptop-lid">
              <span className="office-desk__laptop-screen" data-active={hot ? "true" : "false"}>
                <i /><i /><i />
              </span>
            </span>
            <span className="office-desk__laptop-base" />
          </div>
        </div>
        <div className="office-desk__chair" />
      </div>

      <p className="office-desk__label">
        <span>DONDIE</span>
        <span data-status={agent.status}>{agent.status}</span>
      </p>
    </button>
  );
}

function AgentSprite({
  agent,
  left,
  top,
  pose,
  onSelect
}: {
  readonly agent: OfficeAgentState;
  readonly left: number;
  readonly top: number;
  readonly pose: OfficePose;
  readonly onSelect: () => void;
}): ReactElement {
  const bubble = statusBubbleText(agent.status, agent.activity);
  const style = { left: `${left}%`, top: `${top}%` } as CSSProperties;

  return (
    <button
      type="button"
      className="office-actor"
      style={style}
      data-role="coordinator"
      data-status={agent.status}
      data-pose={pose}
      data-testid="office-agent-coordinator"
      aria-label={`${agent.label}, ${agent.status}: ${agent.activity}`}
      onClick={onSelect}
    >
      {bubble ? (
        <span className="office-actor__bubble" data-tone={agent.status} aria-hidden="true">
          {bubble}
        </span>
      ) : null}
      {pose === "think" ? (
        <span className="office-actor__dots" aria-hidden="true">
          <i /><i /><i />
        </span>
      ) : null}
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
          <span>DONDIE · DESK</span>
        </div>
      </div>
      <div className="office-decor__rug" />
    </div>
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
  const agent = world.agents.coordinator;
  const select = (): void => onSelectRole("coordinator");

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

          <LaptopDesk
            agent={agent}
            selected={selectedRole === "coordinator"}
            onSelect={select}
          />

          <AgentSprite
            agent={agent}
            left={DESK.left}
            top={DESK.top - 10}
            pose={deskPose(agent)}
            onSelect={select}
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
              Start hands-off from the desk — agent picks strategy. Fund in Alpaca.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
