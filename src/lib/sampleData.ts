import * as XLSX from 'xlsx'
import { parseWorkbook } from './parseExcel'
import type { ParseResult } from './types'

const PRODUCTS = [
  { name: '70 Litre Swing Bin Compact Plastic Wastebasket with Center-Weighted Swing Lid', sku: 'DK-617', price: 15.99 },
  { name: 'ApexStack Pro Stackable Storage Organizer Bins', sku: 'DK-030', price: 24.49 },
  { name: '4 PCS Silicone Stretch Lids Reusable Food Covers', sku: 'SL-204', price: 7.99 },
  { name: 'LED Motion Sensor Closet Light Rechargeable', sku: 'LT-118', price: 12.49 },
  { name: 'Foldable Laundry Hamper with Handles', sku: 'HM-552', price: 18.99 },
  { name: 'Magnetic Phone Mount for Car Dashboard', sku: 'PM-073', price: 9.99 },
  { name: 'Stainless Steel Insulated Water Bottle 1L', sku: 'WB-900', price: 21.0 },
  { name: 'Adjustable Pet Grooming Brush Self-Cleaning', sku: 'PT-441', price: 11.49 },
]
const VARIATIONS = ['Charcoal Black/1', 'Pastel Pink/1', 'White/2', 'Blue/1', 'Standard']
const STATUSES = ['Delivered', 'Delivered', 'Shipped', 'Shipped', 'Processing', 'Canceled']
const CARRIERS = ['EVRI', 'Royal Mail', 'DPD', 'Yodel']
const CITIES: Array<[string, string]> = [
  ['Pinner', 'Greater London'],
  ['Manchester', 'Greater Manchester'],
  ['Birmingham', 'West Midlands'],
  ['Leeds', 'West Yorkshire'],
  ['Bristol', 'Bristol'],
  ['Glasgow', 'Glasgow City'],
]
const MONTHS = ['Jun', 'Jun', 'Jun', 'May']

// Deterministic PRNG (Math.random is unavailable in some sandboxes).
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEMU_BANNER =
  "!!! Important pre-shipment reminders:\n1. Confirm in the 'Approved courier list' below whether your selected courier is approved by Temu.\n2. Using an unapproved courier will result in order fulfillment failure."

const HEADERS = [
  'Order ID', 'order status', 'Fulfillment mode', 'Order item ID', 'order item status',
  'product name by customer order', 'product name', 'variation', 'contribution sku', 'SKU ID',
  'quantity purchased', 'quantity to ship', 'quantity shipped', 'quantity canceled',
  'recipient name', 'ship city', 'ship state', 'ship country', 'purchase date',
  'goods base price', 'retail price total', 'shipping cost', 'product tax total',
  'tracking number', 'carrier', 'order settlement status', 'Discount from Temu',
]

/**
 * Build an in-memory workbook that mimics a real Temu export — banner rows,
 * headers on row 6, two sheets — and run it through the real parser so the demo
 * exercises the same code path as an uploaded file.
 */
export function buildSampleData(count = 60): ParseResult {
  const rand = mulberry32(20260623)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]

  // Array-of-arrays starting with the banner + blank rows, headers on row 6.
  const aoa: unknown[][] = [
    [TEMU_BANNER],
    [], [], [], [],
    HEADERS,
  ]

  for (let i = 0; i < count; i++) {
    const p = pick(PRODUCTS)
    const status = pick(STATUSES)
    const qty = 1 + Math.floor(rand() * 3)
    const canceled = status === 'Canceled' ? qty : 0
    const shipped = canceled ? 0 : qty
    const toShip = status === 'Processing' ? qty : 0
    const discounted = Math.round(p.price * (0.75 + rand() * 0.2) * 100) / 100
    const retailTotal = Math.round(discounted * qty * 100) / 100
    const [city, state] = pick(CITIES)
    const day = 1 + Math.floor(rand() * 27)
    const orderId = `PO-210-${(700000000000 + Math.floor(rand() * 9e10)).toString()}`

    aoa.push([
      orderId, status, 'Seller fulfillment', `210-${Math.floor(rand() * 9e13)}`, status,
      p.name, p.name, pick(VARIATIONS), p.sku, String(54000000000000 + Math.floor(rand() * 9e11)),
      qty, toShip, shipped, canceled,
      'redacted recipient', city, state, 'United Kingdom', `${pick(MONTHS)} ${day}, 2026, 1:04 pm BST(UTC+1)`,
      `£${p.price.toFixed(2)}`, `£${retailTotal.toFixed(2)}`, `£${(1 + rand() * 2).toFixed(2)}`, `£${(retailTotal * 0.05).toFixed(2)}`,
      `H0${Math.floor(rand() * 9e9)}`, pick(CARRIERS), pick(['Settled', 'Unsettled']),
      rand() > 0.7 ? `-£${(rand() * 5).toFixed(2)}` : '',
    ])
  }

  const orderSheet = XLSX.utils.aoa_to_sheet(aoa)
  const courierSheet = XLSX.utils.aoa_to_sheet([['Approved courier list'], ['EVRI'], ['Royal Mail']])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, orderSheet, 'Order report')
  XLSX.utils.book_append_sheet(wb, courierSheet, 'Approved courier list')

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const result = parseWorkbook(buffer, 'sample-temu-orders.xlsx')
  result.warnings = []
  return result
}
