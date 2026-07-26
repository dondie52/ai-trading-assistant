"use client";

import type { ReactElement } from "react";
import type { OfficeAgentState, OfficeRole, OfficeWorld } from "./office-types";
import { resolvePose, statusBubbleText, type OfficePose } from "./office-pose";

function deskPose(agent: OfficeAgentState): OfficePose {
  const pose = resolvePose(agent);
  return pose === "stand" || pose === "walk" ? "sit" : pose;
}

function LaptopDesk({
  agent,
  selected
}: {
  readonly agent: OfficeAgentState;
  readonly selected: boolean;
}): ReactElement {
  const hot = agent.status === "working" || agent.status === "waiting";
  const danger = agent.status === "alert" || agent.status === "error";

  return (
    <div
      className="office-desk"
      data-status={agent.status}
      data-selected={selected ? "true" : "false"}
      data-testid="office-desk-coordinator"
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
      </div>

      <p className="office-desk__label">
        <span>DONDIE</span>
        <span data-status={agent.status}>{agent.status}</span>
      </p>
    </div>
  );
}

function AgentSprite({
  agent,
  pose
}: {
  readonly agent: OfficeAgentState;
  readonly pose: OfficePose;
}): ReactElement {
  const bubble = statusBubbleText(agent.status, agent.activity);

  return (
    <div
      className="office-actor office-actor--desk"
      data-role="coordinator"
      data-status={agent.status}
      data-pose={pose}
      data-testid="office-agent-coordinator"
      aria-hidden="true"
    >
      {bubble ? (
        <span className="office-actor__bubble" data-tone={agent.status}>
          {bubble}
        </span>
      ) : null}
      {pose === "think" ? (
        <span className="office-actor__dots">
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
    </div>
  );
}

function OfficeDecor({ night }: { readonly night: boolean }): ReactElement {
  return (
    <div className="office-decor" aria-hidden="true">
      <div className="office-decor__wall-left" />
      <div className="office-decor__wall-right" />
      <div className="office-decor__back-wall" />
      <div className="office-decor__window" data-night={night ? "true" : "false"} />
      <div className="office-decor__server office-decor__server--a">
        <span /><span /><span /><span />
      </div>
      <div className="office-decor__server office-decor__server--b">
        <span /><span /><span /><span />
      </div>
      <div className="office-decor__shelf office-decor__shelf--a" />
      <div className="office-decor__shelf office-decor__shelf--b" />
      <div className="office-decor__plant office-decor__plant--tl" />
      <div className="office-decor__plant office-decor__plant--tall office-decor__plant--br" />
      <div className="office-decor__plant office-decor__plant--bc" />
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
  const selected = selectedRole === "coordinator";

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

          <button
            type="button"
            className="office-stage"
            data-selected={selected ? "true" : "false"}
            data-status={agent.status}
            aria-label={`${agent.label}, ${agent.status}: ${agent.activity}`}
            onClick={() => onSelectRole("coordinator")}
          >
            <AgentSprite agent={agent} pose={deskPose(agent)} />
            <LaptopDesk agent={agent} selected={selected} />
          </button>

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
              Tap the desk to start hands-off. Fund in Alpaca.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
