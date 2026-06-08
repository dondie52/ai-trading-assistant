import type { JsonObject, MarketCandle, SignalType } from "@trading/types";
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

  let signalType: SignalType = "HOLD";
  if ((aboveTrend && momentum > 0 && rsiValue < 72) || macdHistogram > 0.15) {
    signalType = "BUY";
  } else if ((!aboveTrend && momentum < 0 && rsiValue > 28) || macdHistogram < -0.15) {
    signalType = "SELL";
  }

  const trendScore = aboveTrend ? 18 : -8;
  const momentumScore = Math.max(-12, Math.min(12, momentum * 8));
  const rsiScore = signalType === "BUY" ? 70 - rsiValue : rsiValue - 30;
  const confidenceScore =
    signalType === "HOLD"
      ? clampConfidence(48 + Math.abs(momentumScore))
      : clampConfidence(58 + trendScore + momentumScore + Math.max(0, rsiScore / 3));

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
      volumeLatest: indicators.volume.latest,
      volumeSma20: indicators.volume.sma,
      volumeChangePercent: indicators.volume.changePercent,
      timeframe: latest?.timeframe ?? "1m"
    }
  };
};
