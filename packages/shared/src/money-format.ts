/**
 * Currency display helpers for micro paper accounts.
 * Never render negative zero; keep sub-cent P&L visible in detail views.
 */

export const normalizeSignedZero = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Object.is(value, -0) || value === 0 ? 0 : value;
};

export const formatUsd = (
  value: number | undefined,
  options?: {
    readonly minimumFractionDigits?: number;
    readonly maximumFractionDigits?: number;
    readonly microDetail?: boolean;
  }
): string => {
  const raw = normalizeSignedZero(value ?? 0);
  const abs = Math.abs(raw);
  const microDetail = options?.microDetail ?? false;

  // Values that round to zero at 2dp but are non-zero: show detail or compact loss/gain.
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

export const formatUsdTooltip = (value: number | undefined): string => {
  const raw = normalizeSignedZero(value ?? 0);
  const sign = raw < 0 ? "-" : "";
  return `${sign}$${Math.abs(raw).toFixed(6)}`;
};
