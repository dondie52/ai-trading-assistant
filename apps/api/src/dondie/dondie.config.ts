/**
 * Dondie survival economics — the agent trades to fund its own cognition.
 * Wallet credits from PnL; brain runs debit wallet; tier gates follow balance.
 * See docs/dondie-survival-model.md
 */
export const dondieConfig = {
  name: "Dondie",
  defaultScheduleMinutes: Number(process.env.DONDIE_SCHEDULE_MINUTES ?? "60"),
  schedulerEnabled: process.env.DONDIE_SCHEDULER_ENABLED !== "false",
  standardTierMinBalance: Number(process.env.DONDIE_STANDARD_MIN_BALANCE ?? "25"),
  proTierMinBalance: Number(process.env.DONDIE_PRO_MIN_BALANCE ?? "100"),
  standardBrainCostUsd: Number(process.env.DONDIE_STANDARD_BRAIN_COST_USD ?? "0.05"),
  proBrainCostUsd: Number(process.env.DONDIE_PRO_BRAIN_COST_USD ?? "0.25"),
  tradePnlCreditPercent: Number(process.env.DONDIE_PNL_CREDIT_PERCENT ?? "10"),
  memoryLimit: Number(process.env.DONDIE_MEMORY_LIMIT ?? "50"),
  /** When US equities are closed for the weekend, Dondie can earn via crypto desk gigs. */
  weekendEarnEnabled: process.env.DONDIE_WEEKEND_EARN_ENABLED !== "false",
  weekendEarnBaseUsd: Number(process.env.DONDIE_WEEKEND_EARN_BASE_USD ?? "0.35"),
  weekendEarnStandardBonusUsd: Number(process.env.DONDIE_WEEKEND_EARN_STANDARD_BONUS_USD ?? "0.15"),
  weekendEarnProBonusUsd: Number(process.env.DONDIE_WEEKEND_EARN_PRO_BONUS_USD ?? "0.35"),
  weekendEarnMaxPerDayUsd: Number(process.env.DONDIE_WEEKEND_EARN_MAX_PER_DAY_USD ?? "2.5"),
  weekendEarnLedgerReason: "WEEKEND_CRYPTO_DESK",
  weekendEarnBrain: "weekend-crypto-desk",
  weekendEarnSymbol: "BTCUSD",
  llmApiUrl: process.env.DONDIE_LLM_API_URL ?? "https://api.openai.com/v1",
  llmApiKey: process.env.DONDIE_LLM_API_KEY ?? "",
  llmStandardModel: process.env.DONDIE_LLM_STANDARD_MODEL ?? "gpt-4o-mini",
  llmProModel: process.env.DONDIE_LLM_PRO_MODEL ?? "gpt-4o",
  fullPowerMaxTradesPerDay: Number(process.env.DONDIE_FULL_POWER_MAX_TRADES_PER_DAY ?? "20"),
  fullPowerMinConfidence: Number(process.env.DONDIE_FULL_POWER_MIN_CONFIDENCE ?? "55"),
  fullPowerAiGrantReason: "FULL_POWER_AI_GRANT",
  /** Wallet balance target for the one-time full-power cognition grant (PRO by default). */
  fullPowerTargetWalletUsd: Number(
    process.env.DONDIE_FULL_POWER_TARGET_WALLET_USD ?? process.env.DONDIE_PRO_MIN_BALANCE ?? "100"
  ),
  nfpWindowMinutesBefore: Number(process.env.DONDIE_NFP_WINDOW_MINUTES_BEFORE ?? "15"),
  nfpWindowMinutesAfter: Number(process.env.DONDIE_NFP_WINDOW_MINUTES_AFTER ?? "120")
} as const;

/** Live env read so tests/ops can toggle without module reload. */
export const isDondieFullPower = (): boolean => process.env.DONDIE_FULL_POWER === "true";

/**
 * When true (default), Dondie only submits orders around the monthly US Non-Farm
 * Payrolls (NFP) release — first Friday of the month, 8:30am America/New_York.
 * Outside that window scans still run but execution is skipped.
 */
export const isDondieNfpOnly = (): boolean => process.env.DONDIE_NFP_ONLY !== "false";
