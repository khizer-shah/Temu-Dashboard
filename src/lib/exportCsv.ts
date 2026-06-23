import type { CostedItem } from './costModel'

const CSV_COLUMNS: Array<{ header: string; value: (o: CostedItem) => string | number }> = [
  { header: 'Order ID', value: (o) => o.orderId },
  { header: 'Order Item ID', value: (o) => o.orderItemId },
  { header: 'Status', value: (o) => o.status },
  { header: 'SKU', value: (o) => o.sku },
  { header: 'Product Name', value: (o) => o.productName },
  { header: 'Variation', value: (o) => o.variation },
  { header: 'Qty Purchased', value: (o) => o.qtyPurchased },
  { header: 'Qty Shipped', value: (o) => o.qtyShipped },
  { header: 'Qty To Ship', value: (o) => o.qtyToShip },
  { header: 'Qty Canceled', value: (o) => o.qtyCanceled },
  { header: 'Revenue', value: (o) => o.revenue.toFixed(2) },
  { header: 'Unit Cost', value: (o) => (o.unitCost == null ? '' : o.unitCost.toFixed(2)) },
  { header: 'Net Profit', value: (o) => (o.netProfit == null ? '' : o.netProfit.toFixed(2)) },
  { header: 'Margin %', value: (o) => (o.margin == null ? '' : (o.margin * 100).toFixed(2)) },
  { header: 'Discount', value: (o) => o.discount.toFixed(2) },
  { header: 'Shipping Cost', value: (o) => o.shippingCost.toFixed(2) },
  { header: 'Carrier', value: (o) => o.carrier },
  { header: 'Tracking Number', value: (o) => o.trackingNumber },
  { header: 'Settlement', value: (o) => o.settlementStatus },
  { header: 'City', value: (o) => o.city },
  { header: 'State', value: (o) => o.state },
  { header: 'Country', value: (o) => o.country },
  { header: 'Purchase Date', value: (o) => o.purchaseDateRaw },
]

function escapeCell(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Build a CSV string from the (already filtered/sorted) order items. */
export function ordersToCsv(items: CostedItem[]): string {
  const head = CSV_COLUMNS.map((c) => c.header).join(',')
  const body = items
    .map((o) => CSV_COLUMNS.map((c) => escapeCell(c.value(o))).join(','))
    .join('\n')
  return `${head}\n${body}`
}

/** Trigger a browser download of the order items as a CSV file. */
export function downloadCsv(items: CostedItem[], fileName = 'temu-orders-export.csv'): void {
  const csv = ordersToCsv(items)
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
