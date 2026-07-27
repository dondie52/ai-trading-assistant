/**
 * Portfolio accounting helpers.
 * Never treat reduced cash or open market value as realized profit.
 */

export interface AccountingPositionInput {
  readonly quantity: number;
  readonly averagePrice: number;
  readonly unrealizedPnl?: number;
  readonly costBasis?: number;
  readonly marketValue?: number;
}

export interface PortfolioAccountingSnapshot {
  readonly cash: number;
  readonly equity: number;
  readonly marketValue: number;
  readonly costBasis: number;
  readonly capitalDeployed: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly dailyPnl: number;
}

/** Sum of open-position cost bases (capital tied up in positions). */
export const sumCostBasis = (positions: readonly AccountingPositionInput[]): number =>
  roundUsd(
    positions.reduce((sum, position) => {
      if (!(Math.abs(position.quantity) > 0)) {
        return sum;
      }
      if (typeof position.costBasis === "number" && Number.isFinite(position.costBasis)) {
        return sum + position.costBasis;
      }
      return sum + Math.abs(position.quantity) * position.averagePrice;
    }, 0)
  );

/** Broker unrealized P&L, or mark-to-market from average entry when missing. */
export const sumUnrealizedPnl = (
  positions: readonly AccountingPositionInput[],
  markPrices?: ReadonlyMap<string, number>
): number =>
  roundUsd(
    positions.reduce((sum, position) => {
      if (!(Math.abs(position.quantity) > 0)) {
        return sum;
      }
      if (typeof position.unrealizedPnl === "number" && Number.isFinite(position.unrealizedPnl)) {
        return sum + position.unrealizedPnl;
      }
      return sum;
    }, 0)
  );

/**
 * Build accounting fields from broker cash/equity and open positions.
 * realizedPnl must come from closed fills — never from equity - cash.
 */
export const buildPortfolioAccounting = (input: {
  readonly cash: number;
  readonly equity: number;
  readonly lastEquity?: number;
  readonly positions: readonly AccountingPositionInput[];
  readonly realizedPnlFromClosedTrades: number;
}): PortfolioAccountingSnapshot => {
  const costBasis = sumCostBasis(input.positions);
  const unrealizedPnl = sumUnrealizedPnl(input.positions);
  const marketValue = roundUsd(
    input.positions.reduce((sum, position) => {
      if (!(Math.abs(position.quantity) > 0)) {
        return sum;
      }
      if (typeof position.marketValue === "number" && Number.isFinite(position.marketValue)) {
        return sum + position.marketValue;
      }
      return sum + Math.abs(position.quantity) * position.averagePrice + (position.unrealizedPnl ?? 0);
    }, 0)
  );
  const dailyPnl =
    typeof input.lastEquity === "number" && Number.isFinite(input.lastEquity)
      ? roundUsd(input.equity - input.lastEquity)
      : 0;

  return {
    cash: roundUsd(input.cash),
    equity: roundUsd(input.equity),
    marketValue,
    costBasis,
    capitalDeployed: costBasis,
    unrealizedPnl,
    realizedPnl: roundUsd(input.realizedPnlFromClosedTrades),
    dailyPnl
  };
};

/** Aggregate duplicate symbol lots into one broker-style position row. */
export const aggregatePositionsBySymbol = <
  T extends {
    readonly symbol: string;
    readonly quantity: number;
    readonly averagePrice: number;
    readonly unrealizedPnl: number;
    readonly costBasis?: number;
    readonly marketValue?: number;
  }
>(
  positions: readonly T[]
): T[] => {
  const bySymbol = new Map<string, T>();
  for (const position of positions) {
    const symbol = position.symbol.toUpperCase();
    const existing = bySymbol.get(symbol);
    if (!existing) {
      bySymbol.set(symbol, { ...position, symbol });
      continue;
    }
    const totalQty = existing.quantity + position.quantity;
    const existingNotional = Math.abs(existing.quantity) * existing.averagePrice;
    const incomingNotional = Math.abs(position.quantity) * position.averagePrice;
    const averagePrice =
      Math.abs(totalQty) > 0
        ? (existingNotional + incomingNotional) / (Math.abs(existing.quantity) + Math.abs(position.quantity))
        : 0;
    bySymbol.set(symbol, {
      ...existing,
      quantity: Number(totalQty.toFixed(6)),
      averagePrice: Number(averagePrice.toFixed(4)),
      unrealizedPnl: Number((existing.unrealizedPnl + position.unrealizedPnl).toFixed(6)),
      ...(typeof existing.costBasis === "number" || typeof position.costBasis === "number"
        ? {
            costBasis: Number(
              ((existing.costBasis ?? existingNotional) + (position.costBasis ?? incomingNotional)).toFixed(4)
            )
          }
        : {}),
      ...(typeof existing.marketValue === "number" || typeof position.marketValue === "number"
        ? {
            marketValue: Number(
              ((existing.marketValue ?? 0) + (position.marketValue ?? 0)).toFixed(4)
            )
          }
        : {})
    });
  }
  return [...bySymbol.values()].filter((position) => Math.abs(position.quantity) > 0.000001);
};

export const roundUsd = (value: number, digits = 4): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  // Normalize negative zero.
  return Object.is(rounded, -0) ? 0 : rounded;
};
