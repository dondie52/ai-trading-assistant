import { describe, expect, it } from "vitest";
import {
  resolveLifestyleLevel,
  resolveNextUnlock,
  resolveRoomTiers
} from "@trading/shared";

describe("dondie room UI contract", () => {
  it("exposes five lifestyle tiers with unlock targets", () => {
    expect([1, 2, 3, 4, 5].map((level) => resolveLifestyleLevel(level === 1 ? 0 : level === 2 ? 25 : level === 3 ? 100 : level === 4 ? 250 : 500))).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(resolveNextUnlock(40, 2).label).toContain("$100");
    expect(resolveRoomTiers(3, "STANDARD").monitor).toBeGreaterThanOrEqual(3);
  });
});
