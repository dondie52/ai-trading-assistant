"use client";

import { AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import type { ReactElement } from "react";
import type { StructuredRiskResult } from "../../lib/risk-display";

export function RiskResultBanner({
  result,
  onApplySuggestedQuantity
}: {
  readonly result: StructuredRiskResult | null;
  readonly approved?: boolean;
  readonly onApplySuggestedQuantity?: (quantity: number) => void;
}): ReactElement | null {
  if (!result) {
    return null;
  }

  return (
    <div
      data-testid="risk-block-message"
      role="alert"
      className="space-y-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-50"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{result.title}</p>
          <p className="text-rose-100/90">{result.message}</p>
          <div className="grid gap-1 text-xs text-rose-100/80 sm:grid-cols-2">
            {result.limit !== undefined ? <p>Configured limit: {result.limit}</p> : null}
            {result.currentValue !== undefined ? <p>Proposed value: {result.currentValue}</p> : null}
            {result.suggestedQuantity !== undefined ? (
              <p>Suggested safe quantity: {result.suggestedQuantity}</p>
            ) : null}
            {result.fixHint ? <p className="sm:col-span-2">{result.fixHint}</p> : null}
          </div>
          {result.suggestedQuantity !== undefined && onApplySuggestedQuantity ? (
            <button
              type="button"
              data-testid="apply-suggested-quantity"
              className="mt-2 rounded-md border border-rose-200/30 bg-rose-500/20 px-3 py-2 text-xs font-medium text-white"
              onClick={() => onApplySuggestedQuantity(result.suggestedQuantity!)}
            >
              Apply suggested quantity ({result.suggestedQuantity})
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RiskPassedBanner(): ReactElement {
  return (
    <div
      data-testid="risk-passed-message"
      className="flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100"
    >
      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4" aria-hidden="true" />
        Risk checks passed
      </div>
    </div>
  );
}
