import type { DondieActivityState, DondieLifestyleLevel } from "@trading/types";

export type OfficePose = "desk" | "bed" | "floor";

export type OfficeBubble =
  | "none"
  | "zzz"
  | "think"
  | "type"
  | "chart"
  | "order"
  | "wait"
  | "execute"
  | "watch"
  | "celebrate"
  | "blocked"
  | "error";

export interface OfficePresentation {
  readonly pose: OfficePose;
  readonly bubble: OfficeBubble;
  readonly working: boolean;
  readonly celebrating: boolean;
  readonly blocked: boolean;
  readonly night: boolean;
  readonly monitorsActive: boolean;
}

export const resolveOfficePresentation = (activity: DondieActivityState): OfficePresentation => {
  switch (activity) {
    case "SLEEPING":
    case "RESTING":
    case "MARKET_CLOSED":
      return {
        pose: "bed",
        bubble: "zzz",
        working: false,
        celebrating: false,
        blocked: false,
        night: true,
        monitorsActive: false
      };
    case "THINKING":
      return {
        pose: "desk",
        bubble: "think",
        working: true,
        celebrating: false,
        blocked: false,
        night: false,
        monitorsActive: true
      };
    case "ANALYSING":
      return {
        pose: "desk",
        bubble: "chart",
        working: true,
        celebrating: false,
        blocked: false,
        night: false,
        monitorsActive: true
      };
    case "PREPARING_ORDER":
      return {
        pose: "desk",
        bubble: "order",
        working: true,
        celebrating: false,
        blocked: false,
        night: false,
        monitorsActive: true
      };
    case "AWAITING_CONFIRMATION":
      return {
        pose: "desk",
        bubble: "wait",
        working: true,
        celebrating: false,
        blocked: false,
        night: false,
        monitorsActive: true
      };
    case "EXECUTING":
      return {
        pose: "desk",
        bubble: "execute",
        working: true,
        celebrating: false,
        blocked: false,
        night: false,
        monitorsActive: true
      };
    case "MONITORING":
      return {
        pose: "desk",
        bubble: "watch",
        working: true,
        celebrating: false,
        blocked: false,
        night: false,
        monitorsActive: true
      };
    case "CELEBRATING":
      return {
        pose: "desk",
        bubble: "celebrate",
        working: false,
        celebrating: true,
        blocked: false,
        night: false,
        monitorsActive: true
      };
    case "BLOCKED_BY_RISK":
    case "BROKER_DISCONNECTED":
      return {
        pose: "desk",
        bubble: "blocked",
        working: false,
        celebrating: false,
        blocked: true,
        night: false,
        monitorsActive: true
      };
    case "ERROR_RETRYING":
      return {
        pose: "floor",
        bubble: "error",
        working: false,
        celebrating: false,
        blocked: true,
        night: false,
        monitorsActive: false
      };
    case "IDLE":
    default:
      return {
        pose: "desk",
        bubble: "none",
        working: false,
        celebrating: false,
        blocked: false,
        night: false,
        monitorsActive: false
      };
  }
};

export const monitorCountForLevel = (monitorTier: DondieLifestyleLevel): number =>
  Math.min(3, Math.max(1, monitorTier));

export const bubbleLabel = (bubble: OfficeBubble): string => {
  switch (bubble) {
    case "zzz":
      return "Zzz";
    case "think":
      return "...";
    case "type":
      return "tap";
    case "chart":
      return "mkt";
    case "order":
      return "ord";
    case "wait":
      return "wait";
    case "execute":
      return "go";
    case "watch":
      return "pos";
    case "celebrate":
      return "*";
    case "blocked":
      return "!";
    case "error":
      return "err";
    case "none":
    default:
      return "";
  }
};
