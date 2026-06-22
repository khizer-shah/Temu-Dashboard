import type { Product } from './types'

export interface CategoryDatum {
  category: string
  revenue: number
  profit: number
  units: number
}

export interface VelocityDatum {
  name: string
  sku: string
  unitsSold: number
  price: number
  revenue: number
  margin: number
}

export interface ProfitDatum {
  name: string
  sku: string
  profit: number
  margin: number
}

/** Revenue / profit / units rolled up by category, sorted by revenue desc. */
export function revenueByCategory(products: Product[]): CategoryDatum[] {
  const map = new Map<string, CategoryDatum>()
  for (const p of products) {
    const cur = map.get(p.category) ?? {
      category: p.category,
      revenue: 0,
      profit: 0,
      units: 0,
    }
    cur.revenue += p.revenue
    cur.profit += p.profit
    cur.units += p.unitsSold
    map.set(p.category, cur)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

/** Scatter of units sold vs price (velocity vs positioning). */
export function velocityScatter(products: Product[]): VelocityDatum[] {
  return products
    .filter((p) => p.unitsSold > 0 || p.price > 0)
    .map((p) => ({
      name: p.name,
      sku: p.sku,
      unitsSold: p.unitsSold,
      price: p.price,
      revenue: p.revenue,
      margin: p.margin,
    }))
}

/** Top-N products by absolute profit, for the profit-per-item trend line. */
export function topByProfit(products: Product[], n = 12): ProfitDatum[] {
  return [...products]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, n)
    .map((p) => ({
      name: p.name,
      sku: p.sku,
      profit: p.profit,
      margin: p.margin,
    }))
}
