import type { OfficeAgentState, OfficeAgentStatus, OfficeRole, OfficeWorld } from "./office-types";

export type OfficePose = "sit" | "stand" | "walk" | "think" | "execute" | "sleep" | "alert";

export type FlowHop = {
  readonly from: OfficeRole;
  readonly to: OfficeRole;
  readonly active: boolean;
};

/** Pipeline order used for the visible Signal → … → Portfolio flow. */
export const FLOW_PIPELINE: readonly OfficeRole[] = [
  "signal",
  "brain",
  "risk",
  "broker",
  "portfolio"
] as const;

export const resolvePose = (agent: OfficeAgentState, isCoordinatorAway = false): OfficePose => {
  if (agent.status === "offline") {
    return "sleep";
  }
  if (agent.status === "error" || agent.status === "alert") {
    return "alert";
  }
  if (agent.status === "waiting") {
    return "think";
  }
  if (agent.status === "working") {
    if (agent.role === "broker" || /execut|submit|fill/i.test(agent.activity)) {
      return "execute";
    }
    if (agent.role === "brain" || agent.role === "signal" || /think|evaluat|scan|analys/i.test(agent.activity)) {
      return "think";
    }
    return "sit";
  }
  if (isCoordinatorAway) {
    return "walk";
  }
  return agent.role === "coordinator" ? "stand" : "sit";
};

export const statusBubbleText = (status: OfficeAgentStatus, activity: string): string => {
  switch (status) {
    case "working":
      if (/scan|signal|market/i.test(activity)) {
        return "SCAN";
      }
      if (/risk|lock|review/i.test(activity)) {
        return "RISK";
      }
      if (/execut|submit|fill|order/i.test(activity)) {
        return "EXEC";
      }
      if (/monitor|position|portfolio|pnl/i.test(activity)) {
        return "BOOK";
      }
      if (/evaluat|strateg|brain|think/i.test(activity)) {
        return "THINK";
      }
      return "WORK";
    case "waiting":
      return "WAIT";
    case "alert":
      return "ALERT";
    case "error":
      return "FAIL";
    case "offline":
      return "OFF";
    case "idle":
    default:
      return "";
  }
};

/** Which pipeline hop should pulse based on the hottest active desk. */
export const resolveActiveFlowHops = (world: OfficeWorld): readonly FlowHop[] => {
  const ranks: Record<OfficeAgentStatus, number> = {
    error: 5,
    alert: 4,
    working: 3,
    waiting: 2,
    offline: 0,
    idle: 0
  };

  let hotIndex = -1;
  let hotScore = 0;
  FLOW_PIPELINE.forEach((role, index) => {
    const score = ranks[world.agents[role].status];
    if (score > hotScore) {
      hotScore = score;
      hotIndex = index;
    }
  });

  return FLOW_PIPELINE.slice(0, -1).map((from, index) => {
    const to = FLOW_PIPELINE[index + 1] as OfficeRole;
    const active = hotScore > 0 && index < hotIndex;
    const current = hotScore > 0 && index === hotIndex - 1;
    return { from, to, active: active || current };
  });
};

export const meetingOccupied = (world: OfficeWorld): boolean => {
  const hot = FLOW_PIPELINE.filter((role) => {
    const status = world.agents[role].status;
    return status === "working" || status === "waiting" || status === "alert";
  });
  return hot.length >= 2 || world.agents.coordinator.status === "working";
};
