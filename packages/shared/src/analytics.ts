import type { PerformanceSummary, Trade } from "@trading/types";

const round = (value: number, precision = 4): number => Number(value.toFixed(precision));

export const calculateWinRate = (trades: readonly Pick<Trade, "pnl">[]): number => {
  if (trades.length === 0) {
    return 0;
  }

  const winners = trades.filter((trade) => trade.pnl > 0).length;
  return round((winners / trades.length) * 100, 2);
};

export const calculateProfitFactor = (trades: readonly Pick<Trade, "pnl">[]): number => {
  const grossProfit = trades
    .filter((trade) => trade.pnl > 0)
    .reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(
    trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0)
  );

  if (grossLoss === 0) {
    return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  }

  return round(grossProfit / grossLoss, 4);
};

export const calculateEquityCurve = (
  startingEquity: number,
  trades: readonly Pick<Trade, "pnl">[]
): readonly number[] => {
  const curve: number[] = [round(startingEquity, 2)];
  for (const trade of trades) {
    const last = curve[curve.length - 1] ?? startingEquity;
    curve.push(round(last + trade.pnl, 2));
  }
  return curve;
};

export const calculateMaxDrawdown = (equityCurve: readonly number[]): number => {
  if (equityCurve.length === 0) {
    return 0;
  }

  let peak = equityCurve[0] ?? 0;
  let maxDrawdown = 0;

  for (const equity of equityCurve) {
    peak = Math.max(peak, equity);
    if (peak > 0) {
      const drawdown = ((peak - equity) / peak) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  return round(maxDrawdown, 2);
};

export const calculateSharpeRatio = (
  returns: readonly number[],
  riskFreeRate = 0
): number => {
  if (returns.length < 2) {
    return 0;
  }

  const excessReturns = returns.map((value) => value - riskFreeRate);
  const average =
    excessReturns.reduce((sum, value) => sum + value, 0) / excessReturns.length;
  const variance =
    excessReturns.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
    (excessReturns.length - 1);
  const standardDeviation = Math.sqrt(variance);

  return standardDeviation === 0 ? 0 : round((average / standardDeviation) * Math.sqrt(252), 4);
};

export const calculateSortinoRatio = (
  returns: readonly number[],
  targetReturn = 0
): number => {
  if (returns.length < 2) {
    return 0;
  }
  const excessReturns = returns.map((value) => value - targetReturn);
  const average = excessReturns.reduce((sum, value) => sum + value, 0) / excessReturns.length;
  const downside = excessReturns.filter((value) => value < 0);
  if (downside.length === 0) {
    return average > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  const downsideDeviation = Math.sqrt(
    downside.reduce((sum, value) => sum + value * value, 0) / downside.length
  );
  return downsideDeviation === 0
    ? 0
    : round((average / downsideDeviation) * Math.sqrt(252), 4);
};

export const calculateAverageTrade = (trades: readonly Pick<Trade, "pnl">[]): number =>
  trades.length === 0
    ? 0
    : round(trades.reduce((sum, trade) => sum + trade.pnl, 0) / trades.length, 2);

export const calculateRiskRewardRatio = (trades: readonly Pick<Trade, "pnl">[]): number => {
  const winners = trades.filter((trade) => trade.pnl > 0);
  const losers = trades.filter((trade) => trade.pnl < 0);
  if (winners.length === 0 || losers.length === 0) {
    return 0;
  }
  const averageWin = winners.reduce((sum, trade) => sum + trade.pnl, 0) / winners.length;
  const averageLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.pnl, 0) / losers.length);
  return averageLoss === 0 ? 0 : round(averageWin / averageLoss, 4);
};

export const summarizePerformance = (
  startingEquity: number,
  trades: readonly Pick<Trade, "pnl">[]
): PerformanceSummary => {
  const curve = calculateEquityCurve(startingEquity, trades);
  const returns = curve.slice(1).map((equity, index) => {
    const previous = curve[index] ?? startingEquity;
    return previous === 0 ? 0 : (equity - previous) / previous;
  });
  const endingEquity = curve[curve.length - 1] ?? startingEquity;

  return {
    winRate: calculateWinRate(trades),
    profitFactor: calculateProfitFactor(trades),
    sharpeRatio: calculateSharpeRatio(returns),
    sortinoRatio: calculateSortinoRatio(returns),
    maxDrawdown: calculateMaxDrawdown(curve),
    totalReturn: startingEquity === 0 ? 0 : round(((endingEquity - startingEquity) / startingEquity) * 100, 2),
    averageTrade: calculateAverageTrade(trades),
    riskRewardRatio: calculateRiskRewardRatio(trades),
    equityCurve: curve
  };
};
