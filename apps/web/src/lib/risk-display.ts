import type { JsonObject, RiskRejection } from "@trading/types";
import { ApiError } from "./api";

export interface StructuredRiskResult {
  readonly approved: false;
  readonly code: string;
  readonly title: string;
  readonly message: string;
  readonly currentValue?: number;
  readonly limit?: number;
  readonly suggestedQuantity?: number;
  readonly fixHint?: string;
  readonly rejections: readonly RiskRejection[];
}

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

export const parseStructuredRiskError = (error: unknown): StructuredRiskResult | null => {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const details = (error.details ?? {}) as JsonObject;
  const code = asString(details.code) ?? error.code;
  const isRisk =
    code === "RISK_REJECTED" ||
    code.startsWith("MAX_") ||
    code.startsWith("INVALID_") ||
    code.includes("STOP") ||
    code.includes("TAKE_PROFIT") ||
    code.includes("CASH") ||
    code.includes("DRAWDOWN") ||
    code.includes("DAILY_LOSS") ||
    code.includes("TRADING_STOPPED") ||
    code.includes("ZERO_POSITION");
  if (!isRisk && error.code !== "RISK_REJECTED") {
    return null;
  }

  const rejections = Array.isArray(details.rejections)
    ? (details.rejections as unknown as RiskRejection[])
    : [];
  const currentValue = asNumber(details.currentValue);
  const limit = asNumber(details.limit);
  const suggestedQuantity = asNumber(details.suggestedQuantity);
  const fixHint = asString(details.fixHint);

  return {
    approved: false,
    code,
    title: asString(details.title) ?? "Risk check failed",
    message: asString(details.message) ?? error.message,
    ...(currentValue !== undefined ? { currentValue } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(suggestedQuantity !== undefined ? { suggestedQuantity } : {}),
    ...(fixHint !== undefined ? { fixHint } : {}),
    rejections
  };
};

export const formatRiskResultMessage = (result: StructuredRiskResult): string => {
  const parts = [
    result.title,
    result.message,
    result.limit !== undefined ? `Limit: ${result.limit}` : null,
    result.currentValue !== undefined ? `Proposed: ${result.currentValue}` : null,
    result.suggestedQuantity !== undefined
      ? `Suggested quantity: ${result.suggestedQuantity}`
      : null,
    result.fixHint
  ].filter(Boolean);
  return parts.join(" · ");
};
