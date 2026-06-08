import type {
  BacktestResult,
  BacktestTrade,
  MarketCandle,
  MarketTimeframe,
  Trade,
  WalkForwardResult,
  WalkForwardWindow
} from "@trading/types";
import { summarizePerformance } from "./analytics.js";

const round = (value: number, precision = 4): number => Number(value.toFixed(precision));

const averageClose = (candles: readonly MarketCandle[], endExclusive: number, period: number): number | null => {
  if (period <= 0 || endExclusive < period) {
    return null;
  }
  const window = candles.slice(endExclusive - period, endExclusive);
  return window.reduce((sum, candle) => sum + candle.close, 0) / period;
};

const validateCandles = (candles: readonly MarketCandle[]): void => {
  for (const candle of candles) {
    const prices = [candle.open, candle.high, candle.low, candle.close, candle.volume];
    if (prices.some((price) => !Number.isFinite(price)) || candle.high < candle.low || candle.volume < 0) {
      throw new Error("Backtest candles contain missing or corrupted market data.");
    }
  }
};

export interface HistoricalBacktestOptions {
  readonly symbol: string;
  readonly timeframe?: MarketTimeframe;
  readonly startingEquity?: number;
  readonly fastPeriod?: number;
  readonly slowPeriod?: number;
  readonly maxPositionPercent?: number;
  readonly feePerTrade?: number;
  readonly slippagePercent?: number;
}

export interface WalkForwardBacktestOptions extends Omit<HistoricalBacktestOptions, "fastPeriod" | "slowPeriod"> {
  readonly trainSize?: number;
  readonly testSize?: number;
  readonly candidates?: readonly {
    readonly fastPeriod: number;
    readonly slowPeriod: number;
  }[];
}

export const runHistoricalBacktest = (
  candles: readonly MarketCandle[],
  options: HistoricalBacktestOptions
): BacktestResult => {
  validateCandles(candles);

  const symbol = options.symbol.toUpperCase();
  const timeframe = options.timeframe ?? candles[0]?.timeframe ?? "1m";
  const startingEquity = options.startingEquity ?? 100_000;
  const fastPeriod = options.fastPeriod ?? 10;
  const slowPeriod = options.slowPeriod ?? 20;
  const maxPositionPercent = options.maxPositionPercent ?? 20;
  const feePerTrade = options.feePerTrade ?? 0;
  const slippagePercent = options.slippagePercent ?? 0.05;
  const slippageRate = slippagePercent / 100;

  if (candles.length < Math.max(fastPeriod, slowPeriod) + 2) {
    throw new Error("At least slowPeriod + 2 candles are required for a backtest.");
  }
  if (fastPeriod >= slowPeriod) {
    throw new Error("fastPeriod must be lower than slowPeriod.");
  }
  if (startingEquity <= 0 || maxPositionPercent <= 0 || feePerTrade < 0 || slippagePercent < 0) {
    throw new Error("Backtest numeric settings are invalid.");
  }

  let equity = startingEquity;
  let position:
    | {
        readonly quantity: number;
        readonly entryPrice: number;
        readonly openedAt: string;
        readonly entryFee: number;
        readonly entrySlippage: number;
      }
    | undefined;
  const trades: BacktestTrade[] = [];

  for (let index = slowPeriod; index < candles.length; index += 1) {
    const candle = candles[index];
    if (!candle) {
      continue;
    }

    const fastNow = averageClose(candles, index + 1, fastPeriod);
    const slowNow = averageClose(candles, index + 1, slowPeriod);
    const fastPrevious = averageClose(candles, index, fastPeriod);
    const slowPrevious = averageClose(candles, index, slowPeriod);
    if (fastNow === null || slowNow === null || fastPrevious === null || slowPrevious === null) {
      continue;
    }

    const shouldEnter = !position && fastNow > slowNow && (trades.length === 0 || fastPrevious <= slowPrevious);
    const shouldExit = Boolean(position && fastNow < slowNow && fastPrevious >= slowPrevious);

    if (shouldEnter) {
      const entryPrice = round(candle.close * (1 + slippageRate), 4);
      const positionValue = equity * (maxPositionPercent / 100);
      const quantity = round(positionValue / entryPrice, 4);
      position = {
        quantity,
        entryPrice,
        openedAt: candle.timestamp,
        entryFee: feePerTrade,
        entrySlippage: round((entryPrice - candle.close) * quantity, 4)
      };
    } else if (shouldExit && position) {
      const exitPrice = round(candle.close * (1 - slippageRate), 4);
      const exitSlippage = round((candle.close - exitPrice) * position.quantity, 4);
      const fees = round(position.entryFee + feePerTrade, 4);
      const pnl = round((exitPrice - position.entryPrice) * position.quantity - fees, 4);
      equity = round(equity + pnl, 4);
      trades.push({
        symbol,
        side: "BUY",
        quantity: position.quantity,
        entryPrice: position.entryPrice,
        exitPrice,
        pnl,
        openedAt: position.openedAt,
        closedAt: candle.timestamp,
        fees,
        slippage: round(position.entrySlippage + exitSlippage, 4)
      });
      position = undefined;
    }
  }

  const lastCandle = candles[candles.length - 1];
  if (position && lastCandle) {
    const exitPrice = round(lastCandle.close * (1 - slippageRate), 4);
    const exitSlippage = round((lastCandle.close - exitPrice) * position.quantity, 4);
    const fees = round(position.entryFee + feePerTrade, 4);
    const pnl = round((exitPrice - position.entryPrice) * position.quantity - fees, 4);
    equity = round(equity + pnl, 4);
    trades.push({
      symbol,
      side: "BUY",
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      exitPrice,
      pnl,
      openedAt: position.openedAt,
      closedAt: lastCandle.timestamp,
      fees,
      slippage: round(position.entrySlippage + exitSlippage, 4)
    });
  }

  const performanceTrades: readonly Pick<Trade, "pnl">[] = trades.map((trade) => ({ pnl: trade.pnl }));
  return {
    symbol,
    timeframe,
    startingEquity,
    endingEquity: round(equity, 2),
    totalTrades: trades.length,
    fees: round(trades.reduce((sum, trade) => sum + trade.fees, 0), 4),
    slippagePercent,
    performance: summarizePerformance(startingEquity, performanceTrades),
    trades,
    generatedAt: new Date().toISOString()
  };
};

export const runWalkForwardBacktest = (
  candles: readonly MarketCandle[],
  options: WalkForwardBacktestOptions
): WalkForwardResult => {
  validateCandles(candles);
  const trainSize = options.trainSize ?? 45;
  const testSize = options.testSize ?? 30;
  const candidates = options.candidates ?? [
    { fastPeriod: 5, slowPeriod: 15 },
    { fastPeriod: 10, slowPeriod: 20 },
    { fastPeriod: 15, slowPeriod: 30 }
  ];
  if (
    trainSize < 10 ||
    testSize < 5 ||
    candles.length < trainSize + testSize ||
    candidates.length === 0 ||
    candidates.some(({ fastPeriod, slowPeriod }) => fastPeriod <= 0 || fastPeriod >= slowPeriod)
  ) {
    throw new Error("Walk-forward settings require valid periods and at least one full train/test window.");
  }

  const symbol = options.symbol.toUpperCase();
  const timeframe = options.timeframe ?? candles[0]?.timeframe ?? "1m";
  const startingEquity = options.startingEquity ?? 100_000;
  let rollingEquity = startingEquity;
  const windows: WalkForwardWindow[] = [];
  const aggregateTrades: BacktestTrade[] = [];

  for (
    let trainingStartIndex = 0, windowIndex = 0;
    trainingStartIndex + trainSize + testSize <= candles.length;
    trainingStartIndex += testSize, windowIndex += 1
  ) {
    const trainingEndIndex = trainingStartIndex + trainSize;
    const testingEndIndex = trainingEndIndex + testSize;
    const trainingCandles = candles.slice(trainingStartIndex, trainingEndIndex);
    const validCandidates = candidates.filter(({ slowPeriod }) => trainingCandles.length >= slowPeriod + 2);
    if (validCandidates.length === 0) {
      throw new Error("Walk-forward training window is too short for the candidate periods.");
    }

    const ranked = validCandidates
      .map((candidate) => ({
        candidate,
        training: runHistoricalBacktest(trainingCandles, {
          ...options,
          symbol,
          timeframe,
          startingEquity: rollingEquity,
          fastPeriod: candidate.fastPeriod,
          slowPeriod: candidate.slowPeriod
        })
      }))
      .sort((left, right) => right.training.performance.totalReturn - left.training.performance.totalReturn);
    const selected = ranked[0];
    if (!selected) {
      throw new Error("Walk-forward parameter selection failed.");
    }

    const testStart = candles[trainingEndIndex];
    const testEnd = candles[testingEndIndex - 1];
    if (!testStart || !testEnd) {
      continue;
    }
    const warmupStart = Math.max(trainingStartIndex, trainingEndIndex - selected.candidate.slowPeriod);
    const testWithWarmup = candles.slice(warmupStart, testingEndIndex);
    const rawResult = runHistoricalBacktest(testWithWarmup, {
      ...options,
      symbol,
      timeframe,
      startingEquity: rollingEquity,
      fastPeriod: selected.candidate.fastPeriod,
      slowPeriod: selected.candidate.slowPeriod
    });
    const outOfSampleTrades = rawResult.trades.filter(
      (trade) => trade.closedAt >= testStart.timestamp
    );
    const performance = summarizePerformance(
      rollingEquity,
      outOfSampleTrades.map((trade) => ({ pnl: trade.pnl }))
    );
    const endingEquity = performance.equityCurve.at(-1) ?? rollingEquity;
    const result: BacktestResult = {
      ...rawResult,
      startingEquity: rollingEquity,
      endingEquity,
      totalTrades: outOfSampleTrades.length,
      fees: round(outOfSampleTrades.reduce((sum, trade) => sum + trade.fees, 0), 4),
      performance,
      trades: outOfSampleTrades
    };
    windows.push({
      index: windowIndex,
      trainingStart: trainingCandles[0]?.timestamp ?? testStart.timestamp,
      trainingEnd: trainingCandles.at(-1)?.timestamp ?? testStart.timestamp,
      testingStart: testStart.timestamp,
      testingEnd: testEnd.timestamp,
      selectedFastPeriod: selected.candidate.fastPeriod,
      selectedSlowPeriod: selected.candidate.slowPeriod,
      trainingReturn: selected.training.performance.totalReturn,
      result
    });
    aggregateTrades.push(...outOfSampleTrades);
    rollingEquity = endingEquity;
  }

  if (windows.length === 0) {
    throw new Error("No complete walk-forward windows were available.");
  }
  return {
    symbol,
    timeframe,
    trainSize,
    testSize,
    startingEquity,
    endingEquity: round(rollingEquity, 2),
    totalTrades: aggregateTrades.length,
    performance: summarizePerformance(
      startingEquity,
      aggregateTrades.map((trade) => ({ pnl: trade.pnl }))
    ),
    windows,
    generatedAt: new Date().toISOString()
  };
};
