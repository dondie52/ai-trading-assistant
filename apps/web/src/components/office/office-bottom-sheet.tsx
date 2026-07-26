"use client";

import type { ReactElement } from "react";
import { InspectorContent, type OfficeInspectorActions } from "./office-inspector";
import type { OfficeRole, OfficeWorld } from "./office-types";

export function OfficeBottomSheet({
  world,
  selectedRole,
  onClose,
  actions,
  onSpeechBubble
}: {
  readonly world: OfficeWorld;
  readonly selectedRole: OfficeRole;
  readonly onClose: () => void;
  readonly actions: OfficeInspectorActions;
  readonly onSpeechBubble?: ((text: string | null) => void) | undefined;
}): ReactElement {
  const agent = world.agents[selectedRole];

  return (
    <div className="office-sheet" data-testid="office-bottom-sheet" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss agent details"
        onClick={onClose}
      />
      <div className="office-sheet__panel relative z-10">
        <div className="office-sheet__handle" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Workstation</p>
          <button
            type="button"
            className="min-h-11 px-2 font-mono text-xs uppercase tracking-wide text-slate-300"
            onClick={onClose}
            data-testid="office-sheet-close"
          >
            Close
          </button>
        </div>
        <InspectorContent
          agent={agent}
          timeline={world.timeline}
          actions={actions}
          onSpeechBubble={onSpeechBubble}
        />
      </div>
    </div>
  );
}
