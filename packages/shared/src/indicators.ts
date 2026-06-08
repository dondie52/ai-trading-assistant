import type { IndicatorSnapshot, MarketCandle, MarketTimeframe } from "@trading/types";

const round = (value: number, precision = 4): number => Number(value.toFixed(precision));

export const sma = (values: readonly number[], period: number): number | null => {
  if (period <= 0 || values.length < period) {
    return null;
  }

  const slice = values.slice(values.length - period);
  const total = slice.reduce((sum, value) => sum + value, 0);
  return round(total / period);
};

export const emaSeries = (values: readonly number[], period: number): readonly number[] => {
  if (period <= 0 || values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result: number[] = [];
  let previous = values[0] ?? 0;

  for (const value of values) {
    previous = result.length === 0 ? value : value * multiplier + previous * (1 - multiplier);
    result.push(round(previous));
  }

  return result;
};

export const ema = (values: readonly number[], period: number): number | null => {
  const series = emaSeries(values, period);
  return series.length > 0 ? series[series.length - 1] ?? null : null;
};

export const rsi = (values: readonly number[], period = 14): number | null => {
  if (period <= 0 || values.length <= period) {
    return null;
  }

  let gains = 0;
  let losses = 0;
  const start = values.length - period;

  for (let index = start; index < values.length; index += 1) {
    const current = values[index] ?? 0;
    const previous = values[index - 1] ?? current;
    const change = current - previous;
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const relativeStrength = gains / period / (losses / period);
  return round(100 - 100 / (1 + relativeStrength), 2);
};

export const macd = (
  values: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): IndicatorSnapshot["macd"] => {
  if (values.length < slowPeriod) {
    return { macd: null, signal: null, histogram: null };
  }

  const fast = emaSeries(values, fastPeriod);
  const slow = emaSeries(values, slowPeriod);
  const macdSeries = values.map((_, index) => {
    const fastValue = fast[index] ?? 0;
    const slowValue = slow[index] ?? 0;
    return round(fastValue - slowValue);
  });
  const signalLine = ema(macdSeries, signalPeriod);
  const macdValue = macdSeries[macdSeries.length - 1] ?? null;

  return {
    macd: macdValue,
    signal: signalLine,
    histogram: macdValue !== null && signalLine !== null ? round(macdValue - signalLine) : null
  };
};

export const bollingerBands = (
  values: readonly number[],
  period = 20,
  standardDeviations = 2
): IndicatorSnapshot["bollingerBands"] => {
  if (period <= 0 || values.length < period) {
    return { upper: null, middle: null, lower: null };
  }

  const slice = values.slice(values.length - period);
  const middle = sma(values, period);
  if (middle === null) {
    return { upper: null, middle: null, lower: null };
  }

  const variance =
    slice.reduce((sum, value) => sum + Math.pow(value - middle, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);

  return {
    upper: round(middle + standardDeviation * standardDeviations),
    middle,
    lower: round(middle - standardDeviation * standardDeviations)
  };
};

export const trueRanges = (candles: readonly MarketCandle[]): readonly number[] =>
  candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.close ?? candle.close;
    return round(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose)
      )
    );
  });

export const atr = (candles: readonly MarketCandle[], period = 14): number | null => {
  if (period <= 0 || candles.length < period + 1) {
    return null;
  }
  return sma(trueRanges(candles), period);
};

export const volumeSnapshot = (
  candles: readonly MarketCandle[],
  period = 20
): IndicatorSnapshot["volume"] => {
  const volumes = candles.map((candle) => candle.volume);
  const latest = volumes[volumes.length - 1] ?? null;
  const previous = volumes[volumes.length - 2] ?? null;
  const average = sma(volumes, period);

  return {
    latest,
    sma: average,
    changePercent:
      latest !== null && previous !== null && previous > 0
        ? round(((latest - previous) / previous) * 100, 2)
        : null
  };
};

export const calculateIndicators = (candles: readonly MarketCandle[]): IndicatorSnapshot => {
  const closes = candles.map((candle) => candle.close);
  return {
    sma: sma(closes, 20),
    ema: ema(closes, 20),
    rsi: rsi(closes, 14),
    macd: macd(closes),
    bollingerBands: bollingerBands(closes),
    atr: atr(candles, 14),
    volume: volumeSnapshot(candles, 20)
  };
};

const timeframeStepMs = (timeframe: MarketTimeframe): number => {
  switch (timeframe) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "4h":
      return 4 * 60 * 60_000;
    case "1d":
      return 24 * 60 * 60_000;
  }
};

const timeframeVolatility = (timeframe: MarketTimeframe): number => {
  switch (timeframe) {
    case "1m":
      return 1;
    case "5m":
      return 1.15;
    case "15m":
      return 1.3;
    case "1h":
      return 1.7;
    case "4h":
      return 2.2;
    case "1d":
      return 2.8;
  }
};

export const generateHistoricalPrices = (
  symbol: string,
  points = 60,
  seedPrice = 185,
  timeframe: MarketTimeframe = "1m"
): readonly MarketCandle[] => {
  const candles: MarketCandle[] = [];
  const stepMs = timeframeStepMs(timeframe);
  const volatility = timeframeVolatility(timeframe);
  const start = Date.now() - points * stepMs;
  let lastClose = seedPrice;

  for (let index = 0; index < points; index += 1) {
    const wave = Math.sin(index / 4) * 1.7 * volatility;
    const drift = index * 0.28 * Math.min(volatility, 2);
    const close = round(seedPrice + drift + wave);
    const open = lastClose;
    const high = round(Math.max(open, close) + 0.9 * volatility);
    const low = round(Math.min(open, close) - 0.9 * volatility);
    candles.push({
      symbol: symbol.toUpperCase(),
      timeframe,
      timestamp: new Date(start + index * stepMs).toISOString(),
      open,
      high,
      low,
      close,
      volume: Math.round((950_000 + index * 1_200) * volatility)
    });
    lastClose = close;
  }

  return candles;
};
