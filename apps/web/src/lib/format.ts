/**
 * Currency display helpers for micro paper accounts.
 * Keep these local to the web app so Next transpilePackages does not
 * pull @trading/shared source (which uses .js extension re-exports).
 */

export const normalizeSignedZero = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Object.is(value, -0) || value === 0 ? 0 : value;
};

export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

export const formatCurrency = (
  value: number | undefined,
  options?: {
    readonly microDetail?: boolean;
    readonly minimumFractionDigits?: number;
    readonly maximumFractionDigits?: number;
  }
): string => {
  const raw = normalizeSignedZero(value ?? 0);
  const abs = Math.abs(raw);
  const microDetail = options?.microDetail ?? false;

  if (abs > 0 && abs < 0.005) {
    if (microDetail) {
      const digits = Math.max(4, options?.maximumFractionDigits ?? 4);
      const sign = raw < 0 ? "-" : "";
      return `${sign}$${abs.toFixed(digits)}`;
    }
    return raw < 0 ? "<$0.01 loss" : "<$0.01 gain";
  }

  const maximumFractionDigits = options?.maximumFractionDigits ?? (microDetail && abs < 1 ? 4 : 2);
  const minimumFractionDigits = options?.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);
  const normalized = normalizeSignedZero(Number(raw.toFixed(maximumFractionDigits)));

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits
  }).format(normalized);
};

export const formatCurrencyTooltip = (value: number | undefined): string => {
  const raw = normalizeSignedZero(value ?? 0);
  const sign = raw < 0 ? "-" : "";
  return `${sign}$${Math.abs(raw).toFixed(6)}`;
};

export const formatPercent = (value: number | undefined): string =>
  `${normalizeSignedZero(value ?? 0).toFixed(2)}%`;

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
