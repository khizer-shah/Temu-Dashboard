// Domain types for the Temu Product Analysis Dashboard.

/** A single normalized product row after parsing + metric derivation. */
export interface Product {
  id: string
  sku: string
  name: string
  category: string
  /** Selling price per unit. */
  price: number
  /** Cost (COGS) per unit. */
  cost: number
  /** Units sold over the reporting period. */
  unitsSold: number
  /** Units currently on hand. */
  stock: number
  rating: number | null

  // --- Derived metrics ---
  /** price * unitsSold (or an explicit revenue column when present). */
  revenue: number
  /** (price - cost) * unitsSold. */
  profit: number
  /** profit / revenue, 0..1. */
  margin: number
  /** Whether stock is at/below the low-stock threshold. */
  lowStock: boolean

  /** Raw original row, kept for transparency / debugging. */
  raw: Record<string, unknown>
}

/** Aggregate KPIs across the whole dataset. */
export interface Kpis {
  totalRevenue: number
  totalProfit: number
  unitsSold: number
  /** Blended profit margin across all revenue, 0..1. */
  profitMargin: number
  lowStockCount: number
  productCount: number
  avgOrderValue: number
}

/** Result of detecting which source columns map to which fields. */
export interface ColumnMapping {
  sku?: string
  name?: string
  category?: string
  price?: string
  cost?: string
  unitsSold?: string
  stock?: string
  revenue?: string
  rating?: string
}

export interface ParseResult {
  products: Product[]
  kpis: Kpis
  mapping: ColumnMapping
  /** Source column headers detected in the file. */
  headers: string[]
  /** Original file name. */
  fileName: string
  /** Rows that were present in the sheet (including any skipped). */
  rowCount: number
  /** Non-fatal notes surfaced to the user (e.g. unmapped columns). */
  warnings: string[]
}

export const LOW_STOCK_THRESHOLD = 10
