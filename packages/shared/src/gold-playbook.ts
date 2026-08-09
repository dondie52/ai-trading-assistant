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
