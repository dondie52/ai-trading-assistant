import { describe, expect, it } from "vitest";
import { isUsEquityMarketOpen, isUsEquityWeekend } from "./market-hours.js";

describe("isUsEquityMarketOpen", () => {
  it("is closed on weekends", () => {
    // Saturday 2026-07-25 15:00 UTC ≈ 11:00 ET
    expect(isUsEquityMarketOpen(new Date("2026-07-25T15:00:00.000Z"))).toBe(false);
  });

  it("is open during a weekday RTH window", () => {
    // Wednesday 2026-07-22 15:00 UTC ≈ 11:00 ET
    expect(isUsEquityMarketOpen(new Date("2026-07-22T15:00:00.000Z"))).toBe(true);
  });

  it("is closed before the open bell", () => {
    // Wednesday 2026-07-22 13:00 UTC ≈ 09:00 ET
    expect(isUsEquityMarketOpen(new Date("2026-07-22T13:00:00.000Z"))).toBe(false);
  });
});

describe("isUsEquityWeekend", () => {
  it("is true on Saturday and Sunday ET", () => {
    expect(isUsEquityWeekend(new Date("2026-07-25T15:00:00.000Z"))).toBe(true);
    expect(isUsEquityWeekend(new Date("2026-07-26T15:00:00.000Z"))).toBe(true);
  });

  it("is false on weekdays even outside RTH", () => {
    expect(isUsEquityWeekend(new Date("2026-07-22T13:00:00.000Z"))).toBe(false);
  });
});
