const NFP_RELEASE_HOUR_ET = 8;
const NFP_RELEASE_MINUTE_ET = 30;

const etParts = (
  at: Date
): {
  readonly day: number;
  readonly weekday: string;
  readonly hour: number;
  readonly minute: number;
} => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  }).formatToParts(at);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0"),
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0")
  };
};

/**
 * US Non-Farm Payrolls prints on the first Friday of each month at 8:30am America/New_York.
 * (BLS occasionally shifts the release by a day around holidays; this covers the standard schedule.)
 */
export const isNfpReleaseDay = (at: Date = new Date()): boolean => {
  const { day, weekday } = etParts(at);
  return weekday === "Fri" && day <= 7;
};

/**
 * True while Dondie is inside its NFP trading window: release day, within
 * `minutesBefore`/`minutesAfter` of the 8:30am America/New_York print.
 */
export const isNfpTradingWindow = (
  at: Date = new Date(),
  minutesBefore = 15,
  minutesAfter = 120
): boolean => {
  if (!isNfpReleaseDay(at)) {
    return false;
  }
  const { hour, minute } = etParts(at);
  const minutesOfDay = hour * 60 + minute;
  const releaseMinutesOfDay = NFP_RELEASE_HOUR_ET * 60 + NFP_RELEASE_MINUTE_ET;
  return (
    minutesOfDay >= releaseMinutesOfDay - minutesBefore &&
    minutesOfDay < releaseMinutesOfDay + minutesAfter
  );
};
