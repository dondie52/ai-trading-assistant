import { describe, expect, it } from "vitest";
import {
  bubbleLabel,
  monitorCountForLevel,
  resolveOfficePresentation
} from "./office-activity";

describe("office activity presentation", () => {
  it("puts sleeping and market-closed states in bed at night", () => {
    expect(resolveOfficePresentation("SLEEPING")).toMatchObject({
      pose: "bed",
      bubble: "zzz",
      night: true,
      monitorsActive: false
    });
    expect(resolveOfficePresentation("MARKET_CLOSED").pose).toBe("bed");
  });

  it("maps trading focus states to an active desk", () => {
    expect(resolveOfficePresentation("ANALYSING")).toMatchObject({
      pose: "desk",
      bubble: "chart",
      working: true,
      monitorsActive: true
    });
    expect(resolveOfficePresentation("SIDE_HUSTLE")).toMatchObject({
      pose: "desk",
      bubble: "chart",
      working: true,
      monitorsActive: true
    });
    expect(resolveOfficePresentation("EXECUTING").bubble).toBe("execute");
    expect(resolveOfficePresentation("CELEBRATING").celebrating).toBe(true);
  });

  it("surfaces blocked and error poses distinctly", () => {
    expect(resolveOfficePresentation("BLOCKED_BY_RISK")).toMatchObject({
      pose: "desk",
      blocked: true,
      bubble: "blocked"
    });
    expect(resolveOfficePresentation("ERROR_RETRYING").pose).toBe("floor");
  });

  it("scales monitor count by room tier", () => {
    expect(monitorCountForLevel(1)).toBe(1);
    expect(monitorCountForLevel(3)).toBe(3);
    expect(monitorCountForLevel(5)).toBe(3);
  });

  it("returns short text bubble labels without emoji", () => {
    expect(bubbleLabel("zzz")).toBe("Zzz");
    expect(bubbleLabel("chart")).toBe("mkt");
    expect(bubbleLabel("none")).toBe("");
  });
});
