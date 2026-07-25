export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

export const formatCurrency = (value: number | undefined): string => currency.format(value ?? 0);

export const formatPercent = (value: number | undefined): string => `${(value ?? 0).toFixed(2)}%`;

/** Share qty — keep sub-cent lots visible (Alpaca paper underfunding used to show 0.00). */
export const formatQty = (value: number | undefined): string => {
  const qty = value ?? 0;
  if (Math.abs(qty) > 0 && Math.abs(qty) < 0.01) {
    return qty.toFixed(4);
  }
  if (Number.isInteger(qty)) {
    return String(qty);
  }
  return qty.toFixed(4).replace(/\.?0+$/, "");
};

export const maskAccountId = (accountId: string): string => {
  if (accountId.length <= 8) {
    return accountId;
  }
  return `${accountId.slice(0, 4)}…${accountId.slice(-4)}`;
};

export const insufficientHistoryLabel = (closedTrades: number, minimum = 5): string => {
  if (closedTrades <= 0) {
    return "Not enough trade history";
  }
  if (closedTrades < minimum) {
    return `Available after ${minimum} closed trades`;
  }
  return "";
};
