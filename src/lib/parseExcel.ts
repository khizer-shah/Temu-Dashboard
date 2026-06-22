import * as XLSX from 'xlsx'
import {
  type ColumnMapping,
  type Kpis,
  type ParseResult,
  type Product,
  LOW_STOCK_THRESHOLD,
} from './types'

/**
 * Synonym lists used to map arbitrary spreadsheet headers onto our fields.
 * Headers are normalized (lowercased, non-alphanumerics stripped) before matching.
 * Order matters: more specific fields are matched first so e.g. "unit cost"
 * doesn't get grabbed by the generic "price" bucket.
 */
const FIELD_SYNONYMS: Array<{
  field: keyof ColumnMapping
  exact: string[]
  contains: string[]
}> = [
  {
    field: 'sku',
    exact: ['sku', 'productid', 'itemid', 'id', 'skuid', 'goodsid', 'asin'],
    contains: ['sku', 'productid', 'itemid', 'goodsid'],
  },
  {
    field: 'name',
    exact: ['name', 'productname', 'title', 'product', 'item', 'itemname', 'goodsname'],
    contains: ['productname', 'producttitle', 'itemname', 'goodsname', 'title'],
  },
  {
    field: 'category',
    exact: ['category', 'cat', 'type', 'department', 'producttype', 'categoryname'],
    contains: ['category', 'department'],
  },
  {
    field: 'cost',
    exact: ['cost', 'unitcost', 'cogs', 'costprice', 'buyprice', 'purchaseprice'],
    contains: ['cost', 'cogs'],
  },
  {
    field: 'revenue',
    exact: ['revenue', 'totalrevenue', 'totalsales', 'gmv', 'sales', 'salesamount', 'grossrevenue'],
    contains: ['revenue', 'gmv', 'totalsales', 'salesamount'],
  },
  {
    field: 'unitsSold',
    exact: [
      'unitssold',
      'qtysold',
      'quantitysold',
      'sold',
      'sales',
      'salesvolume',
      'orders',
      'unitsales',
      'volume',
    ],
    contains: ['unitssold', 'qtysold', 'quantitysold', 'salesvolume', 'unitsales', 'orderqty'],
  },
  {
    field: 'price',
    exact: ['price', 'unitprice', 'sellingprice', 'saleprice', 'listprice', 'retailprice', 'msrp'],
    contains: ['price'],
  },
  {
    field: 'stock',
    exact: ['stock', 'inventory', 'quantity', 'qty', 'onhand', 'stockonhand', 'available', 'instock'],
    contains: ['stock', 'inventory', 'onhand', 'available'],
  },
  {
    field: 'rating',
    exact: ['rating', 'stars', 'score', 'avgrating', 'reviewscore'],
    contains: ['rating', 'stars', 'reviewscore'],
  },
]

const normalize = (s: string): string =>
  String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

/** Detect which source header maps to each of our fields. */
export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<string>()
  const normd = headers.map((h) => ({ raw: h, norm: normalize(h) }))

  for (const { field, exact, contains } of FIELD_SYNONYMS) {
    // 1) Prefer an exact normalized match.
    let hit = normd.find((h) => !used.has(h.raw) && exact.includes(h.norm))
    // 2) Fall back to a "contains" match.
    if (!hit) {
      hit = normd.find(
        (h) => !used.has(h.raw) && contains.some((c) => h.norm.includes(c)),
      )
    }
    if (hit) {
      mapping[field] = hit.raw
      used.add(hit.raw)
    }
  }
  return mapping
}

/** Coerce arbitrary cell values to a finite number (handles "$1,299.00", "12%"). */
function toNumber(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = String(value).replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function toStringSafe(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

/** Build a normalized Product (with derived metrics) from a raw row. */
function buildProduct(
  raw: Record<string, unknown>,
  mapping: ColumnMapping,
  index: number,
): Product {
  const get = (field: keyof ColumnMapping): unknown =>
    mapping[field] ? raw[mapping[field] as string] : undefined

  const price = toNumber(get('price'))
  const cost = toNumber(get('cost'))
  const unitsSold = toNumber(get('unitsSold'))
  const stock = toNumber(get('stock'))
  const ratingRaw = get('rating')

  // Revenue: prefer explicit column, else price * units.
  const explicitRevenue = toNumber(get('revenue'))
  const revenue = explicitRevenue > 0 ? explicitRevenue : price * unitsSold

  // Profit: (price - cost) per unit * units sold.
  const profit = (price - cost) * unitsSold
  const margin = revenue > 0 ? profit / revenue : 0

  const sku = toStringSafe(get('sku')) || `ROW-${index + 1}`
  const name = toStringSafe(get('name')) || sku

  return {
    id: `${sku}-${index}`,
    sku,
    name,
    category: toStringSafe(get('category')) || 'Uncategorized',
    price,
    cost,
    unitsSold,
    stock,
    rating: ratingRaw == null || ratingRaw === '' ? null : toNumber(ratingRaw),
    revenue,
    profit,
    margin,
    lowStock: stock > 0 ? stock <= LOW_STOCK_THRESHOLD : false,
    raw,
  }
}

function computeKpis(products: Product[]): Kpis {
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalProfit = products.reduce((s, p) => s + p.profit, 0)
  const unitsSold = products.reduce((s, p) => s + p.unitsSold, 0)
  const lowStockCount = products.filter((p) => p.lowStock).length

  return {
    totalRevenue,
    totalProfit,
    unitsSold,
    profitMargin: totalRevenue > 0 ? totalProfit / totalRevenue : 0,
    lowStockCount,
    productCount: products.length,
    avgOrderValue: unitsSold > 0 ? totalRevenue / unitsSold : 0,
  }
}

/**
 * Parse a `.xlsx` / `.xls` file (as an ArrayBuffer) into normalized products,
 * a detected column mapping, and aggregate KPIs.
 */
export function parseWorkbook(buffer: ArrayBuffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('The workbook contains no sheets.')
  }
  const sheet = workbook.Sheets[firstSheetName]

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  })

  if (rows.length === 0) {
    throw new Error('The first sheet has no data rows.')
  }

  const headers = Object.keys(rows[0])
  const mapping = detectColumns(headers)

  const warnings: string[] = []
  if (!mapping.price && !mapping.revenue) {
    warnings.push(
      'No price or revenue column detected — revenue metrics may read as zero.',
    )
  }
  if (!mapping.unitsSold) {
    warnings.push('No "units sold" column detected — sales velocity may be incomplete.')
  }
  if (!mapping.stock) {
    warnings.push('No stock/inventory column detected — low-stock alerts are disabled.')
  }

  // Drop fully-empty rows.
  const products = rows
    .filter((r) => Object.values(r).some((v) => v !== '' && v != null))
    .map((r, i) => buildProduct(r, mapping, i))

  return {
    products,
    kpis: computeKpis(products),
    mapping,
    headers,
    fileName,
    rowCount: rows.length,
    warnings,
  }
}

/** Read a File object and parse it. Rejects on read or parse errors. */
export function parseExcelFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(parseWorkbook(reader.result as ArrayBuffer, file.name))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse the file.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsArrayBuffer(file)
  })
}
