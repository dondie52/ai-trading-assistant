/**
 * Gold-specific domain knowledge for Dondie's LLM brain, distilled from two sources: StoneX/
 * FOREX.com's "How To Trade Gold" white paper, and Lex van Dam Financial Education's "5-Step
 * Trading" gold course workbook. There is no fine-tuning pipeline here — this briefing is
 * injected into the LLM prompt as context so gold trades reason about the drivers that
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
  "especially around economic data releases (NFP, CPI, FOMC). Determine range vs. trend first: " +
  "in a trend, trade with it (buy dips in an uptrend, sell rallies in a downtrend) rather than " +
  "fading it; only counter-trend fade at range extremes (support/resistance, Fibonacci " +
  "retracement levels around 23.6/38.2/50/61.8/78.6%). Net non-commercial futures positioning " +
  "and sentiment surveys are useful as contrarian signals at extremes — when positioning or " +
  "sentiment is one-sidedly bullish or bearish, that itself is a caution flag for a reversal. " +
  "Gold also has a seasonal tendency (weaker Feb/Mar/May/Jun/Oct/Dec, stronger " +
  "Jan/Apr/Jul/Aug/Sep/Nov historically) worth weighing as a minor tiebreaker, never a primary " +
  "signal. Leveraged gold instruments (futures, CFDs) can wipe out a position on a ~10% adverse " +
  "move at 10x leverage — size positions and stops for that volatility rather than treating " +
  "gold like a low-beta equity.";

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

/**
 * Average historical monthly gold return (%), Jan–Dec, from the Lex van Dam gold course
 * workbook's seasonality study (since 1968). Index 0 = January.
 */
export const GOLD_SEASONALITY_MONTHLY_BIAS_PERCENT = [
  0.6, -0.5, -0.1, 0.5, -0.2, -1.0, 0.5, 1.5, 2.0, -0.8, 1.5, -0.5
] as const;

/** Small confidence nudge applied when the calendar-month seasonal bias agrees/disagrees with the signal. */
export const GOLD_SEASONALITY_TILT = 3;

/** The historical average gold return (%) for the calendar month of `at`, UTC-based. */
export const goldSeasonalityBiasPercent = (at: Date = new Date()): number =>
  GOLD_SEASONALITY_MONTHLY_BIAS_PERCENT[at.getUTCMonth()] ?? 0;
