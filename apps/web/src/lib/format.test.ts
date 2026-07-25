import { describe, expect, it } from "vitest";
import { formatQty } from "./format";

describe("formatQty", () => {
  it("keeps sub-cent lots visible instead of 0.00", () => {
    expect(formatQty(0.0036)).toBe("0.0036");
    expect(formatQty(0.01)).toBe("0.01");
    expect(formatQty(1)).toBe("1");
  });
});
