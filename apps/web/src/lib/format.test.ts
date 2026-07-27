import { describe, expect, it } from "vitest";
import { formatCurrency, formatQty } from "./format";

describe("formatQty", () => {
  it("keeps sub-cent lots visible instead of 0.00", () => {
    expect(formatQty(0.0036)).toBe("0.0036");
    expect(formatQty(0.01)).toBe("0.01");
    expect(formatQty(1)).toBe("1");
  });
});

describe("formatCurrency", () => {
  it("does not display negative zero for tiny losses", () => {
    expect(formatCurrency(-0.0011)).toBe("<$0.01 loss");
    expect(formatCurrency(-0.0011, { microDetail: true })).toBe("-$0.0011");
    expect(formatCurrency(-0)).toBe("$0.00");
    expect(formatCurrency(0)).toBe("$0.00");
  });
});
