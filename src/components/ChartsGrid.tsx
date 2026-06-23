import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, PieChart as PieIcon, TrendingUp } from 'lucide-react'
import type { CostedItem } from '../lib/costModel'
import {
  topProductsByRevenue,
  statusBreakdown,
  revenueOverTime,
} from '../lib/aggregations'
import { formatCurrencyCompact, formatNumber } from '../lib/format'
import { useThemeColors } from '../lib/useThemeColors'
import { ChartCard } from './ChartCard'

// Status -> color. These hues (cyan/amber/red/sky) read acceptably in both
// themes, so they stay static; only the chrome (grid/axis/tooltip) flips.
const STATUS_COLORS: Record<string, string> = {
  delivered: '#0d9488',
  shipped: '#0ea5e9',
  processing: '#f59e0b',
  pending: '#f59e0b',
  unshipped: '#f59e0b',
  canceled: '#ef4444',
  cancelled: '#ef4444',
  refunded: '#ef4444',
}
const STATUS_FALLBACK = ['#0d9488', '#0ea5e9', '#6366f1', '#f59e0b', '#ef4444', '#64748b']

function statusColor(status: string, i: number): string {
  return STATUS_COLORS[status.toLowerCase()] ?? STATUS_FALLBACK[i % STATUS_FALLBACK.length]
}

function truncate(s: string, n = 32): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function ChartsGrid({ items, currency }: { items: CostedItem[]; currency: string }) {
  const c = useThemeColors()
  const products = useMemo(() => topProductsByRevenue(items, 8), [items])
  const statuses = useMemo(() => statusBreakdown(items), [items])
  const trend = useMemo(() => revenueOverTime(items), [items])

  const tooltipStyle = {
    backgroundColor: c.tooltipBg,
    border: `1px solid ${c.tooltipBorder}`,
    borderRadius: 12,
  }

  const ProductTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload as { name: string; sku: string; revenue: number; units: number }
    return (
      <div style={tooltipStyle} className="px-3 py-2 text-xs">
        <p className="max-w-[240px] font-medium text-white">{truncate(d.name, 60)}</p>
        <p className="text-slate-400">{d.sku}</p>
        <p className="text-accent">{formatCurrencyCompact(d.revenue, currency)} · {formatNumber(d.units)} units</p>
      </div>
    )
  }

  const StatusTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload as { status: string; count: number; revenue: number }
    return (
      <div style={tooltipStyle} className="px-3 py-2 text-xs">
        <p className="font-medium text-white">{d.status}</p>
        <p className="text-accent">{formatNumber(d.count)} items · {formatCurrencyCompact(d.revenue, currency)}</p>
      </div>
    )
  }

  const TrendTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload as { label: string; revenue: number; orders: number }
    return (
      <div style={tooltipStyle} className="px-3 py-2 text-xs">
        <p className="font-medium text-white">{d.label}</p>
        <p className="text-accent">{formatCurrencyCompact(d.revenue, currency)}</p>
        <p className="text-slate-400">{formatNumber(d.orders)} orders</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {/* Top products by revenue */}
      <ChartCard
        title="Top Products"
        subtitle="Revenue by SKU"
        icon={BarChart3}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={products} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={c.grid} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCurrencyCompact(v, currency)}
              stroke={c.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="sku"
              width={90}
              stroke={c.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => truncate(String(v), 12)}
            />
            <Tooltip content={<ProductTooltip />} cursor={{ fill: c.cursorFill }} />
            <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={22}>
              {products.map((_, i) => (
                <Cell key={i} fill={c.accent} fillOpacity={1 - i * 0.09} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Order status distribution */}
      <ChartCard
        title="Order Status"
        subtitle="Fulfillment distribution"
        icon={PieIcon}
      >
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={statuses}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
              stroke={c.sliceStroke}
              strokeWidth={2}
            >
              {statuses.map((s, i) => (
                <Cell key={s.status} fill={statusColor(s.status, i)} />
              ))}
            </Pie>
            <Tooltip content={<StatusTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {statuses.map((s, i) => (
            <span key={s.status} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(s.status, i) }} />
              {s.status} · {formatNumber(s.count)}
            </span>
          ))}
        </div>
      </ChartCard>

      {/* Revenue over time */}
      <ChartCard
        title="Revenue Over Time"
        subtitle="Daily sales trend"
        icon={TrendingUp}
        className="lg:col-span-2 xl:col-span-1"
      >
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={c.axis}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                stroke={c.axis}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCurrencyCompact(v, currency)}
                width={52}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={c.accent}
                strokeWidth={2}
                fill="url(#revFill)"
                dot={{ r: 2.5, fill: c.accent, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-center text-sm text-slate-600">
            No parseable purchase dates in this export.
          </div>
        )}
      </ChartCard>
    </div>
  )
}
