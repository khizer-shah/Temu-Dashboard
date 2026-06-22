// Domain types for the Temu Order Analysis Dashboard.
//
// Real Temu exports are ORDER line-item reports (one row per order item), not a
// product catalog. There is no cost/COGS or stock column, so we model what the
// data actually contains: revenue, quantities, status, dates, carrier, destination.

/** A single normalized order line item after parsing. */
export interface OrderItem {
  id: string
  orderId: string
  orderItemId: string
  /** Order-level status, e.g. "Shipped", "Delivered", "Canceled". */
  status: string
  fulfillmentMode: string

  productName: string
  variation: string
  /** Seller SKU (contribution sku) when present, else Temu's numeric SKU ID. */
  sku: string

  qtyPurchased: number
  qtyShipped: number
  qtyToShip: number
  qtyCanceled: number

  /** Line revenue (retail price total, or goods base price × qty as fallback). */
  revenue: number
  goodsBasePrice: number
  shippingCost: number
  taxTotal: number
  /** Combined discounts (Temu + seller), typically negative. */
  discount: number

  carrier: string
  trackingNumber: string
  settlementStatus: string

  /** Destination, best-effort. */
  city: string
  state: string
  country: string

  /** Parsed purchase date (null if unparseable). */
  purchaseDate: PurchaseDate | null
  purchaseDateRaw: string

  /** True when the item still needs shipping (actionable alert). */
  awaitingShipment: boolean

  /** Raw original row, kept for transparency / CSV export. */
  raw: Record<string, unknown>
}

export interface PurchaseDate {
  /** Sortable key, YYYY-MM-DD. */
  key: string
  /** Short display label, e.g. "Jun 18". */
  label: string
  /** Numeric sort value (year*10000 + month*100 + day). */
  sort: number
}

/** Aggregate KPIs across the dataset. */
export interface Kpis {
  totalRevenue: number
  unitsSold: number
  /** Distinct Order IDs (an order can span several line items). */
  orderCount: number
  itemCount: number
  avgOrderValue: number
  awaitingShipment: number
  canceledUnits: number
  totalDiscount: number
}

/** Which source columns mapped to which field. */
export type FieldKey =
  | 'orderId'
  | 'orderItemId'
  | 'status'
  | 'itemStatus'
  | 'fulfillmentMode'
  | 'productName'
  | 'variation'
  | 'contributionSku'
  | 'skuId'
  | 'qtyPurchased'
  | 'qtyShipped'
  | 'qtyToShip'
  | 'qtyCanceled'
  | 'retailPriceTotal'
  | 'goodsBasePrice'
  | 'activityGoodsBasePrice'
  | 'shippingCost'
  | 'taxTotal'
  | 'discountTemu'
  | 'discountSeller'
  | 'carrier'
  | 'trackingNumber'
  | 'settlementStatus'
  | 'city'
  | 'state'
  | 'country'
  | 'purchaseDate'

export type ColumnMapping = Partial<Record<FieldKey, string>>

export interface ParseResult {
  items: OrderItem[]
  kpis: Kpis
  mapping: ColumnMapping
  /** Source column headers detected in the file. */
  headers: string[]
  /** Sheet that was used. */
  sheetName: string
  /** Original file name. */
  fileName: string
  rowCount: number
  /** ISO currency code detected from the data ("GBP", "USD", "EUR"). */
  currency: string
  /** Non-fatal notes surfaced to the user. */
  warnings: string[]
}
