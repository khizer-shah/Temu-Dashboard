import { useMemo } from 'react'
import { X, Package, Tag, Coins, Receipt, TrendingUp, Truck, Boxes } from 'lucide-react'
import type { CostedItem } from '../lib/costModel'
import { normSku, skuKey } from '../lib/costModel'
import { useStore } from '../store/StoreContext'
import { formatMoney, formatNumber, formatPercent } from '../lib/format'

interface Props {
  /** The clicked line item (gives the SKU + name to aggregate on). */
  item: CostedItem
  /** All account items, so we can roll up every order for this product. */
  allItems: CostedItem[]
  currency: string
  onClose: () => void
}

/** A labelled metric tile. */
function Stat({
  icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'default' | 'accent' | 'positive' | 'negative'
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'positive'
        ? 'text-accent'
        : tone === 'negative'
          ? 'text-red-400'
          : 'text-white'
  return (
    <div className="rounded-xl border border-white/5 bg-surface-800 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${valueTone}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export function ProductDetailModal({ item, allItems, currency, onClose }: Props) {
  const { products } = useStore()
  const key = normSku(item.sku)

  const agg = useMemo(() => {
    const rows = allItems.filter((i) => normSku(i.sku) === key)
    const units = rows.reduce((s, i) => s + i.qtyPurchased, 0)
    const shipped = rows.reduce((s, i) => s + i.qtyShipped, 0)
    const canceled = rows.reduce((s, i) => s + i.qtyCanceled, 0)
    const revenue = rows.reduce((s, i) => s + i.revenue, 0)
    const vat = rows.reduce((s, i) => s + i.taxTotal, 0)
    const discount = rows.reduce((s, i) => s + i.discount, 0)
    const shipping = rows.reduce((s, i) => s + i.shippingCost, 0)
    const orders = new Set(rows.map((i) => i.orderId)).size

    // Unit cost: prefer a reconciled cost on the items, else the saved catalog cost.
    const product = products.find((p) => p.skuKey === skuKey(item.sku))
    const costedRow = rows.find((i) => i.hasCost && i.unitCost != null)
    const unitCost = costedRow?.unitCost ?? product?.costPrice ?? null
    const totalCost = unitCost != null ? unitCost * units : null
    const netProfit = totalCost != null ? revenue - totalCost : null
    const margin = netProfit != null && revenue > 0 ? netProfit / revenue : null
    const avgSell = units > 0 ? revenue / units : 0

    // Status breakdown.
    const statusCounts = new Map<string, number>()
    for (const i of rows) {
      const s = i.status || 'Unknown'
      statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1)
    }

    // Top destinations.
    const destCounts = new Map<string, number>()
    for (const i of rows) {
      const d = [i.city, i.country].filter(Boolean).join(', ') || '—'
      destCounts.set(d, (destCounts.get(d) ?? 0) + i.qtyPurchased)
    }
    const topDest = [...destCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)

    return {
      rows,
      units,
      shipped,
      canceled,
      revenue,
      vat,
      discount,
      shipping,
      orders,
      unitCost,
      totalCost,
      netProfit,
      margin,
      avgSell,
      target: product?.targetListingPrice ?? null,
      statuses: [...statusCounts.entries()].sort((a, b) => b[1] - a[1]),
      topDest,
    }
  }, [allItems, key, item.sku, products])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-850 shadow-glow animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/5 p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <Package className="h-4 w-4 shrink-0 text-accent" />
              <span className="truncate" title={item.productName}>
                {item.productName || 'Product'}
              </span>
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-surface-700 px-2 py-0.5 font-mono text-slate-300">
                <Tag className="h-3 w-3" />
                {item.sku}
              </span>
              {item.variation && <span className="text-slate-400">{item.variation}</span>}
              <span>·</span>
              <span>
                {formatNumber(agg.orders)} order{agg.orders === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {/* Headline metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              icon={<Boxes className="h-3 w-3" />}
              label="Units Sold"
              value={formatNumber(agg.units)}
              sub={`${formatNumber(agg.shipped)} shipped · ${formatNumber(agg.canceled)} canceled`}
            />
            <Stat
              icon={<Coins className="h-3 w-3" />}
              label="Revenue"
              value={formatMoney(agg.revenue, currency)}
              sub={`${formatMoney(agg.avgSell, currency)} avg / unit`}
            />
            <Stat
              icon={<TrendingUp className="h-3 w-3" />}
              label="Net Profit"
              value={agg.netProfit == null ? '—' : formatMoney(agg.netProfit, currency)}
              sub={agg.margin == null ? 'no cost yet' : `${formatPercent(agg.margin, 0)} margin`}
              tone={agg.netProfit == null ? 'default' : agg.netProfit < 0 ? 'negative' : 'positive'}
            />
            <Stat
              icon={<Receipt className="h-3 w-3" />}
              label="VAT / Tax"
              value={formatMoney(agg.vat, currency)}
              sub="across all orders"
            />
          </div>

          {/* Cost & pricing */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              Cost &amp; Pricing
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Unit Cost"
                value={agg.unitCost == null ? '—' : formatMoney(agg.unitCost, currency)}
                sub={agg.unitCost == null ? 'no invoice cost' : 'from invoice'}
                tone="accent"
              />
              <Stat
                label="Total Cost"
                value={agg.totalCost == null ? '—' : formatMoney(agg.totalCost, currency)}
                sub={agg.unitCost == null ? '—' : `${formatNumber(agg.units)} × unit cost`}
              />
              <Stat
                label="Target Retail"
                value={agg.target == null ? '—' : formatMoney(agg.target, currency)}
                sub="catalog (+20%)"
              />
              <Stat
                label="Avg Sell Price"
                value={formatMoney(agg.avgSell, currency)}
                sub="revenue / unit"
              />
            </div>
          </div>

          {/* Other money flows */}
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Adjustments</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat
                icon={<Receipt className="h-3 w-3" />}
                label="Discounts"
                value={formatMoney(agg.discount, currency)}
              />
              <Stat
                icon={<Truck className="h-3 w-3" />}
                label="Shipping"
                value={formatMoney(agg.shipping, currency)}
              />
              <Stat label="Gross Margin/Unit"
                value={
                  agg.unitCost == null
                    ? '—'
                    : formatMoney(agg.avgSell - agg.unitCost, currency)
                }
                tone={agg.unitCost != null && agg.avgSell - agg.unitCost < 0 ? 'negative' : 'default'}
              />
            </div>
          </div>

          {/* Status + destinations */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                Order Status
              </h3>
              <div className="space-y-1.5">
                {agg.statuses.map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-800 px-3 py-1.5 text-sm"
                  >
                    <span className="text-slate-300">{status}</span>
                    <span className="tabular-nums text-slate-400">{formatNumber(count)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                Top Destinations
              </h3>
              <div className="space-y-1.5">
                {agg.topDest.map(([dest, qty]) => (
                  <div
                    key={dest}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-800 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-slate-300" title={dest}>
                      {dest}
                    </span>
                    <span className="shrink-0 pl-2 tabular-nums text-slate-400">
                      {formatNumber(qty)} u
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/5 p-4">
          <p className="text-xs text-slate-500">
            Aggregated across {formatNumber(agg.rows.length)} line item
            {agg.rows.length === 1 ? '' : 's'} for this SKU.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
