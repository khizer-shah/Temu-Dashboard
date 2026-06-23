// Cost reconciliation: overlay the global cost registry onto an account's order
// items and recompute profit. Kept pure so it can run on every render cheaply.
import type { CostEntry } from './db'
import type { OrderItem } from './types'

/** Normalize a SKU for cross-referencing (invoices vs. order sheets vary). */
export function skuKey(sku: string): string {
  return String(sku ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export type CostMap = Map<string, CostEntry>

export function buildCostMap(entries: CostEntry[]): CostMap {
  const map: CostMap = new Map()
  for (const e of entries) map.set(e.skuKey, e)
  return map
}

/** An order item enriched with reconciled cost + profit (when a cost is known). */
export interface CostedItem extends OrderItem {
  unitCost: number | null
  /** revenue - unitsSold * unitCost, or null when cost is unknown. */
  netProfit: number | null
  margin: number | null
  hasCost: boolean
}

/**
 * Reconciliation pass. For each item, look up its SKU in the cost map and, when
 * found, compute Item Net Profit = revenue - (unitsSold * extractedCost).
 * Items without a matching cost keep null profit (shown as "—", not zero).
 */
export function applyCosts(items: OrderItem[], costs: CostMap): CostedItem[] {
  return items.map((item) => {
    // Match on the seller SKU first, then fall back to the raw skuId.
    const entry = costs.get(skuKey(item.sku)) ?? null
    if (!entry) {
      return { ...item, unitCost: null, netProfit: null, margin: null, hasCost: false }
    }
    const units = item.qtyPurchased || 0
    const netProfit = item.revenue - units * entry.unitCost
    const margin = item.revenue > 0 ? netProfit / item.revenue : null
    return {
      ...item,
      unitCost: entry.unitCost,
      netProfit,
      margin,
      hasCost: true,
    }
  })
}

export interface CostedKpis {
  totalRevenue: number
  unitsSold: number
  orderCount: number
  itemCount: number
  avgOrderValue: number
  awaitingShipment: number
  canceledUnits: number
  totalDiscount: number
  // Cost-aware additions:
  /** Net profit summed over items that HAVE a cost. */
  netProfit: number
  /** Blended margin over costed revenue, 0..1, or null if no costs yet. */
  profitMargin: number | null
  /** How many items have a reconciled cost. */
  costedItems: number
  /** Revenue belonging to costed items (denominator for margin). */
  costedRevenue: number
}

export function computeCostedKpis(items: CostedItem[]): CostedKpis {
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)
  const unitsSold = items.reduce((s, i) => s + i.qtyPurchased, 0)
  const orderIds = new Set(items.map((i) => i.orderId))
  const awaitingShipment = items.filter((i) => i.awaitingShipment).length
  const canceledUnits = items.reduce((s, i) => s + i.qtyCanceled, 0)
  const totalDiscount = items.reduce((s, i) => s + i.discount, 0)

  const costed = items.filter((i) => i.hasCost)
  const netProfit = costed.reduce((s, i) => s + (i.netProfit ?? 0), 0)
  const costedRevenue = costed.reduce((s, i) => s + i.revenue, 0)

  return {
    totalRevenue,
    unitsSold,
    orderCount: orderIds.size,
    itemCount: items.length,
    avgOrderValue: orderIds.size > 0 ? totalRevenue / orderIds.size : 0,
    awaitingShipment,
    canceledUnits,
    totalDiscount,
    netProfit,
    profitMargin: costedRevenue > 0 ? netProfit / costedRevenue : null,
    costedItems: costed.length,
    costedRevenue,
  }
}
