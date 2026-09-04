import type { JsonObject, MarketCandle, SignalType } from "@trading/types";
import { GOLD_SEASONALITY_TILT, GOLD_SIGNAL_TUNING, goldSeasonalityBiasPercent, isGoldSymbol } from "./gold-playbook.js";
import { calculateIndicators } from "./indicators.js";

export interface GeneratedSignal {
  readonly symbol: string;
  readonly signalType: SignalType;
  readonly confidenceScore: number;
  readonly modelVersion: string;
  readonly features: JsonObject;
}

const clampConfidence = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Bars used to build the breakout channel. Gold trends more persistently, so it gets a wider channel
 * to avoid mistaking normal chop for a confirmed breakout. */
const DEFAULT_BREAKOUT_LOOKBACK = 20;
const GOLD_BREAKOUT_LOOKBACK = 30;

/** A breakout only counts as confirmed when participation is meaningfully above average. */
const VOLUME_CONFIRMATION_MULTIPLIER = 1.15;

interface DonchianChannel {
  readonly high: number | null;
  readonly low: number | null;
}

/** Highest high / lowest low over the `lookback` bars preceding the most recent (still-forming) one. */
const donchianChannel = (candles: readonly MarketCandle[], lookback: number): DonchianChannel => {
  const priorCandles = candles.slice(Math.max(0, candles.length - 1 - lookback), candles.length - 1);
  if (priorCandles.length < lookback) {
    return { high: null, low: null };
  }
  return {
    high: Math.max(...priorCandles.map((candle) => candle.high)),
    low: Math.min(...priorCandles.map((candle) => candle.low))
  };
};

/**
 * Trend-following breakout technique: a BUY/SELL only fires when price closes outside its recent
 * range (a Donchian breakout) in the direction of the prevailing trend (price vs. EMA20), backed
 * by above-average volume. This trades far less often than an oscillator blend, but every trade
 * has range expansion, trend, and participation all agreeing — the entries a breakout/trend
 * strategy is built around. Exits (trend reversal / trailing stop) are handled downstream by the
 * risk engine and order management, not by this signal.
 */
export const generateSignal = (
  symbol: string,
  candles: readonly MarketCandle[],
  modelVersion = "trend-breakout-1.0.0",
  now: Date = new Date()
): GeneratedSignal => {
  const indicators = calculateIndicators(candles);
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const latestClose = latest?.close ?? 0;
  const previousClose = previous?.close ?? latestClose;
  const momentum = latestClose - previousClose;
  const goldAware = isGoldSymbol(symbol);

  const aboveTrend = indicators.ema === null ? false : latestClose > indicators.ema;

  const breakoutLookback = goldAware ? GOLD_BREAKOUT_LOOKBACK : DEFAULT_BREAKOUT_LOOKBACK;
  const channel = donchianChannel(candles, breakoutLookback);

  const volumeLatest = indicators.volume.latest;
  const volumeAverage = indicators.volume.sma;
  const volumeConfirmed =
    volumeLatest !== null && volumeAverage !== null && volumeAverage > 0
      ? volumeLatest >= volumeAverage * VOLUME_CONFIRMATION_MULTIPLIER
      : false;

  const breaksAbove = channel.high !== null && latestClose > channel.high;
  const breaksBelow = channel.low !== null && latestClose < channel.low;

  let signalType: SignalType = "HOLD";
  let breakoutDirection: "UP" | "DOWN" | null = null;
  if (breaksAbove && aboveTrend && volumeConfirmed) {
    signalType = "BUY";
    breakoutDirection = "UP";
  } else if (breaksBelow && !aboveTrend && volumeConfirmed) {
    signalType = "SELL";
    breakoutDirection = "DOWN";
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

  // How decisively price cleared the channel edge, scaled by ATR so the same $ move counts for
  // more on a quiet instrument than a volatile one.
  const atrValue = indicators.atr;
  const breakoutDistancePercent =
    atrValue !== null && atrValue > 0 && breakoutDirection !== null
      ? breakoutDirection === "UP"
        ? ((latestClose - (channel.high ?? latestClose)) / atrValue) * 100
        : (((channel.low ?? latestClose) - latestClose) / atrValue) * 100
      : null;
  const breakoutScore = breakoutDistancePercent !== null ? clamp(breakoutDistancePercent, 0, 20) : 0;

  const volumeScore =
    volumeLatest !== null && volumeAverage !== null && volumeAverage > 0
      ? clamp(((volumeLatest - volumeAverage) / volumeAverage) * 100, -20, 20)
      : 0;

  // Elevated ATR relative to price flags event-driven volatility (NFP/CPI/FOMC) — temper
  // conviction rather than treating gold's swings like an equity's.
  const atrPercent = atrValue !== null && latestClose > 0 ? (atrValue / latestClose) * 100 : null;
  const volatilityPenalty =
    goldAware && atrPercent !== null && atrPercent > GOLD_SIGNAL_TUNING.atrVolatilityPercentThreshold
      ? GOLD_SIGNAL_TUNING.atrVolatilityPenalty
      : 0;

  // Seasonal tendency is a minor tiebreaker, not a primary signal: nudge confidence when the
  // calendar-month historical bias agrees with the signal direction, and pull it back when it
  // disagrees.
  const seasonalBiasPercent = goldAware ? goldSeasonalityBiasPercent(now) : null;
  const seasonalTilt =
    goldAware && seasonalBiasPercent !== null && signalType !== "HOLD"
      ? (signalType === "BUY" ? Math.sign(seasonalBiasPercent) : -Math.sign(seasonalBiasPercent)) *
        GOLD_SEASONALITY_TILT
      : 0;

  const confidenceScore =
    signalType === "HOLD"
      ? clampConfidence(42 + Math.abs(volumeScore) / 2 - volatilityPenalty)
      : clampConfidence(55 + trendScore + breakoutScore + volumeScore / 2 - volatilityPenalty + seasonalTilt);

  return {
    symbol: symbol.toUpperCase(),
    signalType,
    confidenceScore,
    modelVersion,
    features: {
      technique: "trend-breakout",
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
      volumeConfirmed,
      breakoutLookback,
      donchianHigh: channel.high,
      donchianLow: channel.low,
      breakoutDirection,
      aboveTrend,
      timeframe: latest?.timeframe ?? "1m",
      goldAware,
      seasonalBiasPercent,
      seasonalTilt
    }
  };
};
