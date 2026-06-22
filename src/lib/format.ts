// Display formatters shared across the dashboard.

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const currencyFmtCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFmt = new Intl.NumberFormat('en-US')

/** Compact currency, e.g. $1.2M / $48.0K — good for KPI tiles. */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return currencyFmt.format(value)
}

export function formatCurrency(value: number): string {
  return currencyFmt.format(value)
}

export function formatMoney(value: number): string {
  return currencyFmtCents.format(value)
}

export function formatNumber(value: number): string {
  return numberFmt.format(Math.round(value))
}

export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return formatNumber(value)
}

/** 0..1 -> "42.0%". */
export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}
