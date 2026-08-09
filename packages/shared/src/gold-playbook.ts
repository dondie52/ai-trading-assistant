/**
 * Gold-specific domain knowledge for Dondie's LLM brain, distilled from
 * StoneX/FOREX.com's "How To Trade Gold" white paper. There is no
 * fine-tuning pipeline here — this briefing is injected into the LLM
 * prompt as context so gold trades reason about the drivers that
 * actually move XAU/USD rather than generic equity heuristics.
 */

const GOLD_SYMBOLS = new Set(["GLD", "IAU", "SGOL", "GLDM", "XAUUSD", "XAU/USD", "XAU", "GOLD"]);

/** True for gold-exposed instruments (ETFs like GLD/IAU or spot tickers like XAUUSD). */
export const isGoldSymbol = (symbol: string): boolean => GOLD_SYMBOLS.has(symbol.trim().toUpperCase());

export const GOLD_TRADING_BRIEFING =
  "Gold-specific context: gold (XAU/USD) trades as a safe-haven asset that is inversely " +
  "correlated with US dollar strength and real interest rates — it tends to rise on inflation " +
  "fears, geopolitical risk, economic uncertainty, or falling-rate expectations, and tends to " +
  "fall when the dollar strengthens, real yields rise, or risk appetite improves. Cross-check " +
  "against correlated markets: DXY and US10Y real yields (inverse), silver/XAG and gold miner " +
  "equities (positive correlation), and safe-haven currencies JPY/CHF alongside commodity " +
  "currencies AUD/CAD. Gold tends to trend cleanly, so weigh moving averages and trendlines " +
  "for direction, RSI/MACD for momentum confirmation, and ATR-based stops for its volatility, " +
  "especially around economic data releases (NFP, CPI, FOMC).";

export const buildGoldAwarePrompt = (basePrompt: string, symbol: string): string =>
  isGoldSymbol(symbol) ? `${basePrompt} ${GOLD_TRADING_BRIEFING}` : basePrompt;

/**
 * Rule-based tuning for the free (non-LLM) brain, translating the white paper's technical
 * guidance into adjustments over the baseline indicator-driven signal — no macro data feed
 * required. Gold trends more persistently than typical equities, so trend/momentum
 * confirmation is weighted higher and RSI overbought/oversold bounds are widened rather than
 * fading a strong trend early. Elevated ATR (relative to price) signals event-driven
 * volatility — e.g. around NFP/CPI/FOMC — and tempers confidence per the paper's risk
 * management guidance.
 */
export const GOLD_SIGNAL_TUNING = {
  trendWeight: 24,
  counterTrendWeight: -10,
  rsiOverbought: 78,
  rsiOversold: 22,
  atrVolatilityPercentThreshold: 2.5,
  atrVolatilityPenalty: 6
} as const;
