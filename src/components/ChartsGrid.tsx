import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { BarChart3, Gauge, TrendingUp } from 'lucide-react'
import type { Product } from '../lib/types'
import { revenueByCategory, velocityScatter, topByProfit } from '../lib/aggregations'
import { formatCurrencyCompact, formatPercent, formatNumber, formatMoney } from '../lib/format'
import { ChartCard } from './ChartCard'

const ACCENT = '#00f5d4'
const GRID = 'rgba(255,255,255,0.05)'
const AXIS = '#475569'

const tooltipStyle = {
  backgroundColor: '#0c0d0f',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 12,
}

function CategoryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="font-medium text-white">{d.category}</p>
      <p className="text-accent">{formatCurrencyCompact(d.revenue)} revenue</p>
      <p className="text-slate-400">{formatCurrencyCompact(d.profit)} profit · {formatNumber(d.units)} units</p>
    </div>
  )
}

function VelocityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="font-medium text-white">{d.name}</p>
      <p className="text-slate-400">{d.sku}</p>
      <p className="text-accent">{formatNumber(d.unitsSold)} units · {formatMoney(d.price)}</p>
      <p className="text-slate-400">{formatPercent(d.margin)} margin</p>
    </div>
  )
}

function ProfitTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <p className="font-medium text-white">{d.name}</p>
      <p className="text-accent">{formatCurrencyCompact(d.profit)} profit</p>
      <p className="text-slate-400">{formatPercent(d.margin)} margin</p>
    </div>
  )
}

export function ChartsGrid({ products }: { products: Product[] }) {
  const categories = useMemo(() => revenueByCategory(products).slice(0, 8), [products])
  const velocity = useMemo(() => velocityScatter(products), [products])
  const profit = useMemo(() => topByProfit(products, 12), [products])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {/* Sales distribution by category */}
      <ChartCard
        title="Revenue by Category"
        subtitle="Sales distribution across product lines"
        icon={BarChart3}
        className="xl:col-span-1"
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCurrencyCompact(v)}
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              width={92}
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CategoryTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={22}>
              {categories.map((_, i) => (
                <Cell key={i} fill={ACCENT} fillOpacity={1 - i * 0.085} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Sales velocity scatter */}
      <ChartCard
        title="Sales Velocity"
        subtitle="Units sold vs. price positioning"
        icon={Gauge}
        className="xl:col-span-1"
      >
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="unitsSold"
              name="Units"
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatNumber(v)}
            />
            <YAxis
              type="number"
              dataKey="price"
              name="Price"
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <ZAxis type="number" dataKey="revenue" range={[24, 320]} name="Revenue" />
            <Tooltip content={<VelocityTooltip />} cursor={{ strokeDasharray: '3 3', stroke: AXIS }} />
            <Scatter data={velocity} fill={ACCENT} fillOpacity={0.55} stroke={ACCENT} strokeOpacity={0.8} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Profit-per-item trend */}
      <ChartCard
        title="Profit Leaders"
        subtitle="Profit-per-item across top SKUs"
        icon={TrendingUp}
        className="lg:col-span-2 xl:col-span-1"
      >
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={profit} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="sku"
              stroke={AXIS}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              angle={-30}
              textAnchor="end"
              height={48}
            />
            <YAxis
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrencyCompact(v)}
            />
            <Tooltip content={<ProfitTooltip />} cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} />
            <Area
              type="monotone"
              dataKey="profit"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#profitFill)"
              dot={{ r: 2.5, fill: ACCENT, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
