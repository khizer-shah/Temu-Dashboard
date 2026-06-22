import type { Product } from './types'

const CSV_COLUMNS: Array<{ header: string; value: (p: Product) => string | number }> = [
  { header: 'SKU', value: (p) => p.sku },
  { header: 'Product Name', value: (p) => p.name },
  { header: 'Category', value: (p) => p.category },
  { header: 'Price', value: (p) => p.price.toFixed(2) },
  { header: 'Cost', value: (p) => p.cost.toFixed(2) },
  { header: 'Units Sold', value: (p) => p.unitsSold },
  { header: 'Stock', value: (p) => p.stock },
  { header: 'Revenue', value: (p) => p.revenue.toFixed(2) },
  { header: 'Profit', value: (p) => p.profit.toFixed(2) },
  { header: 'Margin %', value: (p) => (p.margin * 100).toFixed(2) },
  { header: 'Rating', value: (p) => (p.rating ?? '') },
  { header: 'Low Stock', value: (p) => (p.lowStock ? 'YES' : 'NO') },
]

function escapeCell(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Build a CSV string from the (already filtered/sorted) products. */
export function productsToCsv(products: Product[]): string {
  const head = CSV_COLUMNS.map((c) => c.header).join(',')
  const body = products
    .map((p) => CSV_COLUMNS.map((c) => escapeCell(c.value(p))).join(','))
    .join('\n')
  return `${head}\n${body}`
}

/** Trigger a browser download of the products as a CSV file. */
export function downloadCsv(products: Product[], fileName = 'temu-products-export.csv'): void {
  const csv = productsToCsv(products)
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
