export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

export const formatCurrency = (value: number | undefined): string => currency.format(value ?? 0);

export const formatPercent = (value: number | undefined): string => `${(value ?? 0).toFixed(2)}%`;

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
