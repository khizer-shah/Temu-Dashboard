// Display formatters shared across the dashboard. Currency is data-driven —
// real Temu exports may be GBP (£), EUR (€), USD ($), etc.

const numberFmt = new Intl.NumberFormat('en-US')

const fmtCache = new Map<string, Intl.NumberFormat>()

function currencyFormatter(currency: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${currency}|${JSON.stringify(opts)}`
  let fmt = fmtCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, ...opts })
    fmtCache.set(key, fmt)
  }
  return fmt
}

/** Compact currency for KPI tiles, e.g. £1.2M / £48.0K. */
export function formatCurrencyCompact(value: number, currency = 'USD'): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const symbol = currencyFormatter(currency, { maximumFractionDigits: 0 })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? ''
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`
  return currencyFormatter(currency, { maximumFractionDigits: 0 }).format(value)
}

export function formatMoney(value: number, currency = 'USD'): string {
  return currencyFormatter(currency, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
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
