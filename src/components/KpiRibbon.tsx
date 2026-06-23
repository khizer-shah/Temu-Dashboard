import { DollarSign, ShoppingBag, TrendingUp, Truck, type LucideIcon } from 'lucide-react'
import type { CostedKpis } from '../lib/costModel'
import { formatCurrencyCompact, formatCompactNumber, formatNumber, formatPercent } from '../lib/format'

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
      <div
        className={[
          'absolute inset-x-0 top-0 h-px',
          isWarn
            ? 'bg-gradient-to-r from-transparent via-amber-400/40 to-transparent'
            : 'bg-gradient-to-r from-transparent via-accent/40 to-transparent',
        ].join(' ')}
      />
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
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
        <div className="text-3xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
        <div className="mt-1 text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  )
}

export function KpiRibbon({ kpis, currency }: { kpis: CostedKpis; currency: string }) {
  const hasCosts = kpis.costedItems > 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Total Revenue"
        value={formatCurrencyCompact(kpis.totalRevenue, currency)}
        sub={`${formatNumber(kpis.orderCount)} orders · ${formatNumber(kpis.itemCount)} line items`}
        icon={DollarSign}
      />
      <KpiCard
        label="Sales Units Sold"
        value={formatCompactNumber(kpis.unitsSold)}
        sub={
          kpis.canceledUnits > 0 ? `${formatNumber(kpis.canceledUnits)} units canceled` : 'No cancellations'
        }
        icon={ShoppingBag}
      />
      {/* Net Profit replaces AOV once any cost is reconciled. */}
      {hasCosts ? (
        <KpiCard
          label="Net Profit"
          value={formatCurrencyCompact(kpis.netProfit, currency)}
          sub={`${formatPercent(kpis.profitMargin ?? 0)} margin · ${formatNumber(kpis.costedItems)}/${formatNumber(
            kpis.itemCount,
          )} costed`}
          icon={TrendingUp}
          tone={kpis.netProfit < 0 ? 'warn' : 'accent'}
        />
      ) : (
        <KpiCard
          label="Avg Order Value"
          value={formatCurrencyCompact(kpis.avgOrderValue, currency)}
          sub="Upload invoices to unlock net profit"
          icon={TrendingUp}
        />
      )}
      <KpiCard
        label="Awaiting Shipment"
        value={formatNumber(kpis.awaitingShipment)}
        sub={kpis.awaitingShipment > 0 ? 'Order items need shipping' : 'All caught up'}
        icon={Truck}
        tone={kpis.awaitingShipment > 0 ? 'warn' : 'accent'}
      />
    </div>
  )
}
