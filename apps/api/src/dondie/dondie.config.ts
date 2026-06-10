export const dondieConfig = {
  name: "Dondie",
  defaultScheduleMinutes: Number(process.env.DONDIE_SCHEDULE_MINUTES ?? "60"),
  schedulerEnabled: process.env.DONDIE_SCHEDULER_ENABLED !== "false",
  standardTierMinBalance: Number(process.env.DONDIE_STANDARD_MIN_BALANCE ?? "25"),
  proTierMinBalance: Number(process.env.DONDIE_PRO_MIN_BALANCE ?? "100"),
  standardBrainCostUsd: Number(process.env.DONDIE_STANDARD_BRAIN_COST_USD ?? "0.05"),
  proBrainCostUsd: Number(process.env.DONDIE_PRO_BRAIN_COST_USD ?? "0.25"),
  proSubscriptionPriceUsd: Number(process.env.DONDIE_PRO_SUBSCRIPTION_USD ?? "29"),
  proSubscriptionAgentShareUsd: Number(process.env.DONDIE_PRO_AGENT_SHARE_USD ?? "20"),
  tradePnlCreditPercent: Number(process.env.DONDIE_PNL_CREDIT_PERCENT ?? "10"),
  memoryLimit: Number(process.env.DONDIE_MEMORY_LIMIT ?? "50"),
  llmApiUrl: process.env.DONDIE_LLM_API_URL ?? "https://api.openai.com/v1",
  llmApiKey: process.env.DONDIE_LLM_API_KEY ?? "",
  llmStandardModel: process.env.DONDIE_LLM_STANDARD_MODEL ?? "gpt-4o-mini",
  llmProModel: process.env.DONDIE_LLM_PRO_MODEL ?? "gpt-4o"
} as const;
