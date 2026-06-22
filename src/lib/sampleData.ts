import { parseWorkbook } from './parseExcel'
import * as XLSX from 'xlsx'
import type { ParseResult } from './types'

const CATEGORIES = [
  'Home & Kitchen',
  'Apparel',
  'Electronics',
  'Beauty',
  'Toys',
  'Sports',
  'Pet Supplies',
  'Accessories',
]

const ADJECTIVES = [
  'Wireless',
  'Foldable',
  'Premium',
  'Mini',
  'Smart',
  'Portable',
  'Eco',
  'Adjustable',
  'LED',
  'Magnetic',
]

const NOUNS = [
  'Organizer',
  'Earbuds',
  'Lamp',
  'Bottle',
  'Charger',
  'Backpack',
  'Holder',
  'Trimmer',
  'Blanket',
  'Tracker',
]

/**
 * Deterministic pseudo-random generator so the demo dataset is stable across
 * renders (and so we avoid Math.random, which is unavailable in some sandboxes).
 */
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

/** Build an in-memory workbook of demo products and run it through the real parser. */
export function buildSampleData(count = 64): ParseResult {
  const rand = mulberry32(20260623)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]

  const rows = Array.from({ length: count }, (_, i) => {
    const cost = Math.round((2 + rand() * 40) * 100) / 100
    const markup = 1.4 + rand() * 1.8
    const price = Math.round(cost * markup * 100) / 100
    const unitsSold = Math.floor(rand() * 1500)
    const stock = Math.floor(rand() * 220)
    const rating = Math.round((3.4 + rand() * 1.6) * 10) / 10

    return {
      SKU: `TM-${(1000 + i).toString()}`,
      'Product Name': `${pick(ADJECTIVES)} ${pick(NOUNS)}`,
      Category: pick(CATEGORIES),
      Price: price,
      'Unit Cost': cost,
      'Units Sold': unitsSold,
      Stock: stock,
      Rating: rating,
    }
  })

  const sheet = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Products')
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  const result = parseWorkbook(buffer, 'sample-temu-catalog.xlsx')
  result.warnings = [] // demo data is complete; suppress mapping notes
  return result
}
