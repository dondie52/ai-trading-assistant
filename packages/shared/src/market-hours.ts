const etParts = (
  at: Date
): {
  readonly weekday: string;
  readonly hour: number;
  readonly minute: number;
} => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  }).formatToParts(at);

  return {
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0")
  };
};

/** True Sat/Sun in America/New_York (US equity weekend). */
export const isUsEquityWeekend = (at: Date = new Date()): boolean => {
  const { weekday } = etParts(at);
  return weekday === "Sat" || weekday === "Sun";
};

/**
 * US equities regular-session check (RTH) in America/New_York.
 * Does not account for exchange holidays.
 */
export const isUsEquityMarketOpen = (at: Date = new Date()): boolean => {
  const { weekday, hour, minute } = etParts(at);
  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }

  const minutes = hour * 60 + minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutes >= open && minutes < close;
};
