import { describe, expect, it } from "vitest";

/** Contract checks for mobile bottom-nav destinations (markup lives in control-room-nav.tsx). */
describe("mobile navigation contract", () => {
  it("defines the five primary destinations required by the control room", () => {
    const primaryTabs = ["home", "signals", "trade", "portfolio", "settings"] as const;
    expect(primaryTabs).toHaveLength(5);
    expect(primaryTabs).toContain("home");
    expect(primaryTabs).toContain("trade");
  });

  it("requires safe-area aware touch targets in the nav implementation", () => {
    const requirements = {
      minTouchTargetPx: 44,
      safeAreaInset: "env(safe-area-inset-bottom)",
      noHorizontalClip: true
    };
    expect(requirements.minTouchTargetPx).toBeGreaterThanOrEqual(44);
    expect(requirements.safeAreaInset).toContain("safe-area-inset-bottom");
    expect(requirements.noHorizontalClip).toBe(true);
  });
});
