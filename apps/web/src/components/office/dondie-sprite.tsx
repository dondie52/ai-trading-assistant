"use client";

import type { ReactElement } from "react";
import { resolveSpriteView, SPRITE_WIDTH, type SpriteRect } from "./dondie-sprite-art";
import type { OfficePose } from "./office-pose";
import type { OfficeAgentStatus } from "./office-types";

const rectKey = (rect: SpriteRect): string => `${rect.x}-${rect.y}-${rect.w}-${rect.h}`;

function Pixels({ rects }: { readonly rects: readonly SpriteRect[] }): ReactElement {
  return (
    <>
      {rects.map((rect) => (
        <rect
          key={rectKey(rect)}
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          fill={rect.fill}
        />
      ))}
    </>
  );
}

/**
 * Dondie as a pixel sprite: frames are cross-faded by CSS on a stepped cycle so
 * the motion stays snappy like a sprite sheet rather than tweened.
 */
export function DondieSprite({
  pose,
  status
}: {
  readonly pose: OfficePose;
  readonly status: OfficeAgentStatus;
}): ReactElement {
  const view = resolveSpriteView(pose, status);

  return (
    <svg
      className="office-sprite"
      viewBox={`0 0 ${SPRITE_WIDTH} ${view.height}`}
      shapeRendering="crispEdges"
      data-mode={view.mode}
      data-frames={view.frames.length}
      focusable="false"
      aria-hidden="true"
    >
      {view.frames.map((rects, index) => (
        <g key={`frame-${index}`} className="office-sprite__frame" data-frame={index}>
          <Pixels rects={rects} />
        </g>
      ))}
      {view.blink ? (
        <g className="office-sprite__blink">
          <Pixels rects={view.blink} />
        </g>
      ) : null}
    </svg>
  );
}
