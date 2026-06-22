import { DollarSign, ShoppingBag, Percent, PackageX, type LucideIcon } from 'lucide-react'
import type { Kpis } from '../lib/types'
import { formatCurrencyCompact, formatCompactNumber, formatPercent, formatNumber } from '../lib/format'

interface KpiCardProps {
  label: string
  value: string
  sub: string
  icon: LucideIcon
  tone?: 'accent' | 'warn'
}

function KpiCard({ label, value, sub, icon: Icon, tone = 'accent' }: KpiCardProps) {
  const isWarn = tone === 'warn'
  return (
    <div className="card group relative overflow-hidden p-5">
      {/* hairline top accent */}
      <div
        className={[
          'absolute inset-x-0 top-0 h-px',
          isWarn
            ? 'bg-gradient-to-r from-transparent via-amber-400/40 to-transparent'
            : 'bg-gradient-to-r from-transparent via-accent/40 to-transparent',
        ].join(' ')}
      />
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
            isWarn
              ? 'border-amber-400/20 bg-amber-400/5 text-amber-400'
              : 'border-accent/20 bg-accent/5 text-accent',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      <div className="mt-4">
        <div className="text-3xl font-semibold tracking-tight text-white tabular-nums">
          {value}
        </div>
        <div className="mt-1 text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  )
}

export function KpiRibbon({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Total Revenue"
        value={formatCurrencyCompact(kpis.totalRevenue)}
        sub={`${formatNumber(kpis.productCount)} SKUs · ${formatCurrencyCompact(kpis.avgOrderValue)} avg / unit`}
        icon={DollarSign}
      />
      <KpiCard
        label="Sales Units Sold"
        value={formatCompactNumber(kpis.unitsSold)}
        sub={`${formatCurrencyCompact(kpis.totalProfit)} total profit`}
        icon={ShoppingBag}
      />
      <KpiCard
        label="Profit Margin"
        value={formatPercent(kpis.profitMargin)}
        sub="Blended across all revenue"
        icon={Percent}
      />
      <KpiCard
        label="Low Stock Alerts"
        value={formatNumber(kpis.lowStockCount)}
        sub={kpis.lowStockCount > 0 ? 'SKUs need replenishment' : 'Inventory healthy'}
        icon={PackageX}
        tone={kpis.lowStockCount > 0 ? 'warn' : 'accent'}
      />
    </div>
  )
}
