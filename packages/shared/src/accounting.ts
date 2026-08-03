/**
 * Portfolio accounting helpers.
 * Never treat reduced cash or open market value as realized profit.
 */

export interface AccountingPositionInput {
  readonly symbol?: string;
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
      // Optional mark map for callers that only have avg entry + live quote.
      const mark = markPrices?.get((position.symbol ?? "").toUpperCase());
      if (typeof mark === "number" && Number.isFinite(mark)) {
        return sum + (mark - position.averagePrice) * position.quantity;
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

export interface BrokerFill {
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly quantity: number;
  readonly price: number;
  /** ISO timestamp of the fill, used for daily/weekly windows and ordering. */
  readonly filledAt: string;
}

export interface RealizedLot {
  readonly symbol: string;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly pnl: number;
  readonly closedAt: string;
}

export interface RealizedPnlSummary {
  readonly total: number;
  readonly lots: readonly RealizedLot[];
}

/**
 * FIFO realized P&L from broker fills.
 *
 * Alpaca exposes fills, not lifetime realized P&L, so the only way to report a number that
 * agrees with the broker is to replay the fills. Long and short inventory are tracked
 * separately per symbol; a fill that crosses through flat closes the old side first and
 * opens the remainder on the new side.
 */
export const computeRealizedPnlFifo = (fills: readonly BrokerFill[]): RealizedPnlSummary => {
  const ordered = [...fills]
    .filter((fill) => Number.isFinite(fill.quantity) && Number.isFinite(fill.price) && fill.quantity > 0)
    .sort((left, right) => {
      const delta = Date.parse(left.filledAt) - Date.parse(right.filledAt);
      return Number.isFinite(delta) ? delta : 0;
    });

  // Per symbol: open lots on one side only. Positive quantity = long, negative = short.
  const inventory = new Map<string, { quantity: number; price: number }[]>();
  const lots: RealizedLot[] = [];
  let total = 0;

  for (const fill of ordered) {
    const symbol = fill.symbol.toUpperCase();
    const queue = inventory.get(symbol) ?? [];
    let remaining = fill.quantity;
    const incomingIsLong = fill.side === "BUY";

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0]!;
      const lotIsLong = lot.quantity > 0;
      if (lotIsLong === incomingIsLong) {
        break; // Same side: this fill adds inventory rather than closing any.
      }
      const closable = Math.min(remaining, Math.abs(lot.quantity));
      const pnl = lotIsLong
        ? (fill.price - lot.price) * closable
        : (lot.price - fill.price) * closable;
      total += pnl;
      lots.push({
        symbol,
        quantity: roundUsd(closable, 6),
        entryPrice: roundUsd(lot.price),
        exitPrice: roundUsd(fill.price),
        pnl: roundUsd(pnl),
        closedAt: fill.filledAt
      });
      lot.quantity = lotIsLong ? lot.quantity - closable : lot.quantity + closable;
      remaining -= closable;
      if (Math.abs(lot.quantity) <= 1e-9) {
        queue.shift();
      }
    }

    if (remaining > 1e-9) {
      queue.push({ quantity: incomingIsLong ? remaining : -remaining, price: fill.price });
    }
    inventory.set(symbol, queue);
  }

  return { total: roundUsd(total), lots };
};

/** Realized P&L closed at or after `sinceIso`. */
export const sumRealizedPnlSince = (lots: readonly RealizedLot[], sinceIso: string): number => {
  const since = Date.parse(sinceIso);
  if (!Number.isFinite(since)) {
    return 0;
  }
  return roundUsd(
    lots.reduce((sum, lot) => {
      const closed = Date.parse(lot.closedAt);
      return Number.isFinite(closed) && closed >= since ? sum + lot.pnl : sum;
    }, 0)
  );
};

/**
 * Losing closes since the most recent winner. Input must be oldest-first.
 * Break-even closes are neither a win nor a loss and do not reset the streak.
 */
export const countConsecutiveLosses = (lots: readonly { readonly pnl: number }[]): number => {
  let streak = 0;
  for (let index = lots.length - 1; index >= 0; index -= 1) {
    const pnl = lots[index]!.pnl;
    if (pnl > 0) {
      break;
    }
    if (pnl < 0) {
      streak += 1;
    }
  }
  return streak;
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
