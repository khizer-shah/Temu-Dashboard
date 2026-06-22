import type { OrderItem } from './types'

export interface ProductDatum {
  name: string
  sku: string
  revenue: number
  units: number
}

export interface StatusDatum {
  status: string
  count: number
  revenue: number
}

export interface TrendDatum {
  key: string
  label: string
  sort: number
  revenue: number
  orders: number
}

export interface DestinationDatum {
  destination: string
  revenue: number
  orders: number
}

/** Top-N products by revenue (rolled up across order items / variations). */
export function topProductsByRevenue(items: OrderItem[], n = 8): ProductDatum[] {
  const map = new Map<string, ProductDatum>()
  for (const it of items) {
    const key = it.sku !== '—' ? it.sku : it.productName
    const cur = map.get(key) ?? { name: it.productName, sku: it.sku, revenue: 0, units: 0 }
    cur.revenue += it.revenue
    cur.units += it.qtyPurchased
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, n)
}

/** Count + revenue grouped by order status. */
export function statusBreakdown(items: OrderItem[]): StatusDatum[] {
  const map = new Map<string, StatusDatum>()
  for (const it of items) {
    const cur = map.get(it.status) ?? { status: it.status, count: 0, revenue: 0 }
    cur.count += 1
    cur.revenue += it.revenue
    map.set(it.status, cur)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/** Revenue + order count grouped by purchase day, sorted chronologically. */
export function revenueOverTime(items: OrderItem[]): TrendDatum[] {
  const map = new Map<string, TrendDatum>()
  for (const it of items) {
    if (!it.purchaseDate) continue
    const { key, label, sort } = it.purchaseDate
    const cur = map.get(key) ?? { key, label, sort, revenue: 0, orders: 0 }
    cur.revenue += it.revenue
    cur.orders += 1
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort)
}

/** Revenue by destination (state when available, else country). */
export function revenueByDestination(items: OrderItem[], n = 8): DestinationDatum[] {
  const map = new Map<string, DestinationDatum>()
  for (const it of items) {
    const dest = it.state || it.country || 'Unknown'
    const cur = map.get(dest) ?? { destination: dest, revenue: 0, orders: 0 }
    cur.revenue += it.revenue
    cur.orders += 1
    map.set(dest, cur)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, n)
}
