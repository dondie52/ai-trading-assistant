import { describe, expect, it } from "vitest";
import type { OfficeAgentState, OfficeWorld } from "./office-types";
import {
  meetingOccupied,
  resolveActiveFlowHops,
  resolvePose,
  statusBubbleText
} from "./office-pose";

const agent = (
  role: OfficeAgentState["role"],
  status: OfficeAgentState["status"],
  activity: string
): OfficeAgentState => ({
  role,
  label: role,
  status,
  activity,
  updatedAt: "2026-07-25T12:00:00.000Z",
  detailLines: []
});

const worldFrom = (partial: Partial<Record<OfficeAgentState["role"], OfficeAgentState>>): OfficeWorld => {
  const idle = (role: OfficeAgentState["role"]): OfficeAgentState => agent(role, "idle", "idle");
  return {
    agents: {
      coordinator: partial.coordinator ?? idle("coordinator"),
      signal: partial.signal ?? idle("signal"),
      brain: partial.brain ?? idle("brain"),
      risk: partial.risk ?? idle("risk"),
      broker: partial.broker ?? idle("broker"),
      portfolio: partial.portfolio ?? idle("portfolio")
    },
    coordinatorAt: "coordinator",
    lifestyleLevel: 2,
    night: false,
    paperMode: true,
    connection: "live",
    loading: false,
    error: null,
    timeline: [],
    agentActive: true
  };
};

describe("office pose and flow", () => {
  it("maps working broker activity to execute pose", () => {
    expect(resolvePose(agent("broker", "working", "Executing BUY AAPL"))).toBe("execute");
    expect(resolvePose(agent("brain", "working", "Evaluating strategy"))).toBe("think");
    expect(resolvePose(agent("signal", "idle", "No recent signal"))).toBe("sit");
    expect(resolvePose(agent("coordinator", "idle", "Standing by"), true)).toBe("walk");
  });

  it("uses short operational bubble labels", () => {
    expect(statusBubbleText("working", "Scanning AAPL")).toBe("SCAN");
    expect(statusBubbleText("working", "Submitting order")).toBe("EXEC");
    expect(statusBubbleText("alert", "Risk lock")).toBe("ALERT");
    expect(statusBubbleText("idle", "Idle")).toBe("");
  });

  it("pulses flow hops up to the hottest active desk", () => {
    const hops = resolveActiveFlowHops(
      worldFrom({
        signal: agent("signal", "working", "Scanning"),
        brain: agent("brain", "working", "Evaluating"),
        risk: agent("risk", "alert", "Risk lock")
      })
    );
    expect(hops.filter((hop) => hop.active).map((hop) => `${hop.from}->${hop.to}`)).toEqual([
      "signal->brain",
      "brain->risk"
    ]);
  });

  it("marks the huddle occupied when multiple desks are active", () => {
    expect(
      meetingOccupied(
        worldFrom({
          brain: agent("brain", "working", "Evaluating"),
          risk: agent("risk", "waiting", "Awaiting confirmation")
        })
      )
    ).toBe(true);
    expect(meetingOccupied(worldFrom({}))).toBe(false);
  });
});
