import type { JsonObject, MarketCandle, SignalType } from "@trading/types";
import { GOLD_SIGNAL_TUNING, isGoldSymbol } from "./gold-playbook.js";
import { calculateIndicators } from "./indicators.js";

export interface GeneratedSignal {
  readonly symbol: string;
  readonly signalType: SignalType;
  readonly confidenceScore: number;
  readonly modelVersion: string;
  readonly features: JsonObject;
}

const clampConfidence = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export const generateSignal = (
  symbol: string,
  candles: readonly MarketCandle[],
  modelVersion = "mvp-baseline-1.0.0"
): GeneratedSignal => {
  const indicators = calculateIndicators(candles);
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const latestClose = latest?.close ?? 0;
  const previousClose = previous?.close ?? latestClose;
  const momentum = latestClose - previousClose;
  const rsiValue = indicators.rsi ?? 50;
  const macdHistogram = indicators.macd.histogram ?? 0;
  const aboveTrend = indicators.ema === null ? false : latestClose > indicators.ema;
  const goldAware = isGoldSymbol(symbol);

  // Gold trends more persistently than typical equities, so oscillators are allowed to run
  // further before they're read as a reversal signal.
  const rsiOverbought = goldAware ? GOLD_SIGNAL_TUNING.rsiOverbought : 72;
  const rsiOversold = goldAware ? GOLD_SIGNAL_TUNING.rsiOversold : 28;

  let signalType: SignalType = "HOLD";
  if ((aboveTrend && momentum > 0 && rsiValue < rsiOverbought) || macdHistogram > 0.15) {
    signalType = "BUY";
  } else if ((!aboveTrend && momentum < 0 && rsiValue > rsiOversold) || macdHistogram < -0.15) {
    signalType = "SELL";
  }

  // Trend/momentum confirmation counts for more on gold; a plain equity weighting would
  // underreact to its cleaner directional moves.
  const trendScore = aboveTrend
    ? goldAware
      ? GOLD_SIGNAL_TUNING.trendWeight
      : 18
    : goldAware
      ? GOLD_SIGNAL_TUNING.counterTrendWeight
      : -8;
  const momentumScore = Math.max(-12, Math.min(12, momentum * 8));
  const rsiScore = signalType === "BUY" ? 70 - rsiValue : rsiValue - 30;

  // Elevated ATR relative to price flags event-driven volatility (NFP/CPI/FOMC) — temper
  // conviction rather than treating gold's swings like an equity's.
  const atrPercent = indicators.atr !== null && latestClose > 0 ? (indicators.atr / latestClose) * 100 : null;
  const volatilityPenalty =
    goldAware && atrPercent !== null && atrPercent > GOLD_SIGNAL_TUNING.atrVolatilityPercentThreshold
      ? GOLD_SIGNAL_TUNING.atrVolatilityPenalty
      : 0;

  const confidenceScore =
    signalType === "HOLD"
      ? clampConfidence(48 + Math.abs(momentumScore) - volatilityPenalty)
      : clampConfidence(58 + trendScore + momentumScore + Math.max(0, rsiScore / 3) - volatilityPenalty);

  return {
    symbol: symbol.toUpperCase(),
    signalType,
    confidenceScore,
    modelVersion,
    features: {
      latestClose,
      previousClose,
      momentum,
      sma20: indicators.sma,
      ema20: indicators.ema,
      rsi14: indicators.rsi,
      macd: indicators.macd.macd,
      macdSignal: indicators.macd.signal,
      macdHistogram: indicators.macd.histogram,
      bollingerUpper: indicators.bollingerBands.upper,
      bollingerMiddle: indicators.bollingerBands.middle,
      bollingerLower: indicators.bollingerBands.lower,
      atr14: indicators.atr,
      atrPercent,
      volumeLatest: indicators.volume.latest,
      volumeSma20: indicators.volume.sma,
      volumeChangePercent: indicators.volume.changePercent,
      timeframe: latest?.timeframe ?? "1m",
      goldAware
    }
  };
};
