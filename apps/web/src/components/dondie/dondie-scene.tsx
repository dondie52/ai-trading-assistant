"use client";

/**
 * Isometric pixel office for Dondie Room.
 * Visual approach inspired by MIT-licensed Claude-Office (W17ant/Claude-Office):
 * live agent pose + status bubbles in a pixel office — driven here by
 * Dondie lifestyle/activity state rather than Claude Code hooks.
 */

import type { ReactElement } from "react";
import type { DondieActivityState, DondieLifestyleLevel, DondieLifestyleWorld } from "@trading/types";
import {
  bubbleLabel,
  monitorCountForLevel,
  resolveOfficePresentation,
  type OfficeBubble
} from "./office-activity";
import "./dondie-office.css";

export function DondieScene({
  world,
  onSelectItem
}: {
  readonly world: DondieLifestyleWorld;
  readonly onSelectItem?: (item: string) => void;
}): ReactElement {
  const presentation = resolveOfficePresentation(world.activity);
  const monitors = monitorCountForLevel(world.room.monitor);
  const screenTone = presentation.celebrating
    ? "celebrate"
    : presentation.blocked
      ? "blocked"
      : "default";
  const headTone = presentation.celebrating
    ? "celebrate"
    : presentation.blocked
      ? "blocked"
      : "default";

  return (
    <div
      data-testid="dondie-scene"
      className="dondie-office overflow-hidden rounded-xl border border-line"
      data-level={world.lifestyleLevel}
      data-night={presentation.night ? "true" : "false"}
      role="img"
      aria-label={`Dondie lifestyle level ${world.lifestyleLevel}, currently ${world.activityLabel}`}
    >
      <div className="dondie-office__stage">
        <div className="dondie-office__pixel-grid" aria-hidden="true" />
        <div className="dondie-office__iso-floor" aria-hidden="true" />
        <div className="dondie-office__ambient" aria-hidden="true" />

        <button
          type="button"
          className="dondie-office__hotspot dondie-office__window"
          onClick={() => onSelectItem?.("lighting")}
          aria-label={`Lighting tier ${world.room.lighting}`}
        >
          <span className="dondie-office__window-pane" />
          {world.lifestyleLevel >= 3 ? <span className="dondie-office__window-glow" /> : null}
        </button>

        <button
          type="button"
          className="dondie-office__hotspot dondie-office__bed"
          onClick={() => onSelectItem?.("bed")}
          aria-label={`Bed tier ${world.room.bed}`}
        >
          <div className="dondie-office__bed-frame">
            <div className="dondie-office__pillow" />
            <div className="dondie-office__mattress" />
          </div>
          <p className="dondie-office__label">Rest · L{world.room.bed}</p>
        </button>

        <button
          type="button"
          className="dondie-office__hotspot dondie-office__desk"
          onClick={() => onSelectItem?.("desk")}
          aria-label={`Desk tier ${world.room.desk}, monitors ${world.room.monitor}`}
        >
          <div className="dondie-office__monitors">
            {Array.from({ length: monitors }).map((_, index) => (
              <div
                key={`monitor-${index}`}
                className={
                  index === 0
                    ? "dondie-office__monitor dondie-office__monitor--main"
                    : "dondie-office__monitor dondie-office__monitor--side"
                }
              >
                <div
                  className="dondie-office__screen"
                  data-active={presentation.monitorsActive ? "true" : "false"}
                  data-tone={screenTone}
                >
                  {presentation.monitorsActive ? (
                    <div className="dondie-office__screen-bars" aria-hidden="true">
                      <span style={{ height: "40%" }} />
                      <span style={{ height: "70%" }} />
                      <span style={{ height: "55%" }} />
                      <span style={{ height: "85%" }} />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="dondie-office__desk-top" />
          <div className="dondie-office__chair" />
          <p className="dondie-office__label">
            Desk L{world.room.desk} · Screens L{world.room.monitor}
          </p>
        </button>

        <button
          type="button"
          className="dondie-office__hotspot dondie-office__safe"
          onClick={() => onSelectItem?.("wallet")}
          aria-label="Cognition wallet"
        >
          ${world.walletBalance.toFixed(0)}
        </button>

        {world.room.decor >= 2 ? (
          <button
            type="button"
            className="dondie-office__hotspot dondie-office__plant"
            onClick={() => onSelectItem?.("decor")}
            aria-label={`Decor tier ${world.room.decor}`}
          >
            <span className="dondie-office__plant-leaf" />
            <span className="dondie-office__plant-pot" />
          </button>
        ) : null}

        {world.lifestyleLevel >= 2 && presentation.pose === "desk" ? (
          <div className="dondie-office__coffee" aria-hidden="true" />
        ) : null}

        <div
          data-testid="dondie-character"
          className="dondie-office__character"
          data-pose={presentation.pose}
          data-working={presentation.working ? "true" : "false"}
        >
          <DondiePixelAvatar
            activity={world.activity}
            bubble={presentation.bubble}
            celebrating={presentation.celebrating}
            headTone={headTone}
            level={world.lifestyleLevel}
          />
        </div>

        <div className="dondie-office__hud">
          <span className="dondie-office__chip">{world.activityLabel}</span>
          <span className="dondie-office__chip">{world.paperTradingLabel} mode</span>
        </div>
      </div>
    </div>
  );
}

function DondiePixelAvatar({
  activity,
  bubble,
  celebrating,
  headTone,
  level
}: {
  readonly activity: DondieActivityState;
  readonly bubble: OfficeBubble;
  readonly celebrating: boolean;
  readonly headTone: "default" | "celebrate" | "blocked";
  readonly level: DondieLifestyleLevel;
}): ReactElement {
  const label = bubbleLabel(bubble);

  return (
    <div className="dondie-office__avatar" data-level={level}>
      {celebrating ? (
        <>
          <span className="dondie-office__spark" aria-hidden="true" />
          <span className="dondie-office__spark" aria-hidden="true" />
          <span className="dondie-office__spark" aria-hidden="true" />
        </>
      ) : null}
      {label ? (
        <span className="dondie-office__bubble" data-kind={bubble} aria-hidden="true">
          {label}
        </span>
      ) : null}
      <div className="dondie-office__head" data-tone={headTone} />
      <div className="dondie-office__body" />
      <div className="dondie-office__legs" aria-hidden="true">
        <span className="dondie-office__leg" />
        <span className="dondie-office__leg" />
      </div>
      <span className="sr-only">{activity}</span>
    </div>
  );
}
