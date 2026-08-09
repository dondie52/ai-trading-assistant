import { describe, expect, it } from "vitest";
import { isNfpReleaseDay, isNfpTradingWindow } from "./nfp-calendar.js";

describe("isNfpReleaseDay", () => {
  it("is true on the first Friday of the month ET", () => {
    // Friday 2026-08-07 13:00 UTC ≈ 09:00 ET
    expect(isNfpReleaseDay(new Date("2026-08-07T13:00:00.000Z"))).toBe(true);
  });

  it("is false on a later Friday in the same month", () => {
    // Friday 2026-08-14 13:00 UTC ≈ 09:00 ET
    expect(isNfpReleaseDay(new Date("2026-08-14T13:00:00.000Z"))).toBe(false);
  });

  it("is false on a non-Friday weekday", () => {
    // Thursday 2026-08-06 13:00 UTC ≈ 09:00 ET
    expect(isNfpReleaseDay(new Date("2026-08-06T13:00:00.000Z"))).toBe(false);
  });
});

describe("isNfpTradingWindow", () => {
  it("is open shortly after the 8:30am ET print", () => {
    // Friday 2026-08-07 13:00 UTC ≈ 09:00 ET
    expect(isNfpTradingWindow(new Date("2026-08-07T13:00:00.000Z"))).toBe(true);
  });

  it("is closed before the configured lead time", () => {
    // Friday 2026-08-07 12:00 UTC ≈ 08:00 ET (30 min before print, default lead is 15 min)
    expect(isNfpTradingWindow(new Date("2026-08-07T12:00:00.000Z"))).toBe(false);
  });

  it("is closed after the configured trailing window", () => {
    // Friday 2026-08-07 15:00 UTC ≈ 11:00 ET (150 min after print, default trailing is 120 min)
    expect(isNfpTradingWindow(new Date("2026-08-07T15:00:00.000Z"))).toBe(false);
  });

  it("is always closed on a non-release day", () => {
    expect(isNfpTradingWindow(new Date("2026-08-14T13:00:00.000Z"))).toBe(false);
  });

  it("respects custom before/after minute windows", () => {
    // Friday 2026-08-07 12:00 UTC ≈ 08:00 ET
    expect(isNfpTradingWindow(new Date("2026-08-07T12:00:00.000Z"), 60, 30)).toBe(true);
  });
});
