import * as XLSX from 'xlsx'
import {
  type ColumnMapping,
  type FieldKey,
  type Kpis,
  type OrderItem,
  type ParseResult,
  type PurchaseDate,
} from './types'

/* ------------------------------------------------------------------ *
 * Header detection
 * ------------------------------------------------------------------ */

/** Normalized candidate header strings, in priority order, per field. */
const FIELD_HEADERS: Record<FieldKey, string[]> = {
  orderId: ['orderid'],
  orderItemId: ['orderitemid'],
  status: ['orderstatus'],
  itemStatus: ['orderitemstatus'],
  fulfillmentMode: ['fulfillmentmode'],
  productName: ['productname', 'productnamebycustomerorder'],
  variation: ['variation'],
  contributionSku: ['contributionsku'],
  skuId: ['skuid'],
  qtyPurchased: ['quantitypurchased'],
  qtyShipped: ['quantityshipped'],
  qtyToShip: ['quantitytoship'],
  qtyCanceled: ['quantitycanceled', 'quantitycancelled'],
  retailPriceTotal: ['retailpricetotal'],
  goodsBasePrice: ['goodsbaseprice'],
  activityGoodsBasePrice: ['activitygoodsbaseprice'],
  shippingCost: ['shippingcost'],
  taxTotal: ['producttaxtotal'],
  discountTemu: ['discountfromtemu'],
  discountSeller: ['discountfromseller'],
  carrier: ['carrier'],
  trackingNumber: ['trackingnumber'],
  settlementStatus: ['ordersettlementstatus', 'settlementstatus'],
  city: ['shipcity'],
  state: ['shipstate'],
  country: ['shipcountry'],
  purchaseDate: ['purchasedate'],
}

/** All known header tokens, used to score which row is the header row. */
const KNOWN_TOKENS = new Set(Object.values(FIELD_HEADERS).flat())

const normalize = (s: unknown): string =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * SheetJS trusts a sheet's stored `!ref`. Temu exports ship a BROKEN range
 * (e.g. `A1:AV6` when data runs to row 12), which silently drops every order.
 * Recompute the true bounding range from the populated cells.
 */
function fixSheetRange(ws: XLSX.WorkSheet): void {
  const addrs = Object.keys(ws).filter((k) => !k.startsWith('!'))
  if (addrs.length === 0) return
  let minR = Infinity
  let minC = Infinity
  let maxR = 0
  let maxC = 0
  for (const a of addrs) {
    const c = XLSX.utils.decode_cell(a)
    if (c.r < minR) minR = c.r
    if (c.c < minC) minC = c.c
    if (c.r > maxR) maxR = c.r
    if (c.c > maxC) maxC = c.c
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } })
}

/** Pick the sheet most likely to hold order data. */
function pickSheet(wb: XLSX.WorkBook): string {
  const names = wb.SheetNames
  // Reject obvious non-data sheets (courier lists, instructions).
  const isJunk = (n: string) => /courier|instruction|guide|readme|help|cover/i.test(n)
  const preferred = (n: string) => /order|report|sales|transaction|item/i.test(n)

  const candidates = names.filter((n) => !isJunk(n))
  const pool = candidates.length ? candidates : names

  // Prefer a name that looks like an order report; otherwise the densest sheet.
  const byName = pool.find((n) => preferred(n))
  if (byName) return byName

  let best = pool[0]
  let bestCells = -1
  for (const n of pool) {
    const cells = Object.keys(wb.Sheets[n]).filter((k) => !k.startsWith('!')).length
    if (cells > bestCells) {
      bestCells = cells
      best = n
    }
  }
  return best
}

/**
 * Find the header row within the first rows of a sheet. Temu hides it behind a
 * banner, so we score each candidate row by how many cells match known header
 * tokens and pick the best (falling back to the row with the most text cells).
 */
function findHeaderRow(aoa: unknown[][]): number {
  const limit = Math.min(aoa.length, 25)
  let bestRow = 0
  let bestScore = -1
  for (let r = 0; r < limit; r++) {
    const row = aoa[r] ?? []
    let known = 0
    let filled = 0
    for (const cell of row) {
      const n = normalize(cell)
      if (!n) continue
      filled++
      if (KNOWN_TOKENS.has(n)) known++
    }
    // Weight known-token matches heavily; break ties on filled-cell count.
    const score = known * 100 + filled
    if (score > bestScore) {
      bestScore = score
      bestRow = r
    }
  }
  return bestRow
}

/** Map detected headers onto our fields. */
function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  const normd = headers.map((h) => normalize(h))

  for (const field of Object.keys(FIELD_HEADERS) as FieldKey[]) {
    for (const candidate of FIELD_HEADERS[field]) {
      const idx = normd.findIndex((n, i) => !used.has(i) && n === candidate)
      if (idx !== -1) {
        mapping[field] = headers[idx]
        used.add(idx)
        break
      }
    }
  }
  return mapping
}

/* ------------------------------------------------------------------ *
 * Value coercion
 * ------------------------------------------------------------------ */

const CURRENCY_SYMBOLS: Array<{ re: RegExp; code: string }> = [
  { re: /£/, code: 'GBP' },
  { re: /€/, code: 'EUR' },
  { re: /\$/, code: 'USD' },
  { re: /¥|円/, code: 'JPY' },
]

/** Coerce "£12.79", "-£5.01", "1,234.56", 42 -> finite number. */
function toNumber(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = String(value).replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function toStr(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/**
 * Parse Temu's date strings, e.g. "Jun 18, 2026, 1:04 pm BST(UTC+1)".
 * We only need day-resolution for the trend chart, so we extract month/day/year
 * by regex and skip the timezone soup entirely.
 */
function parsePurchaseDate(raw: string): PurchaseDate | null {
  if (!raw) return null
  const m = raw.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()]
    const day = parseInt(m[2], 10)
    const year = parseInt(m[3], 10)
    if (mon && day) {
      const key = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const label = `${m[1].slice(0, 3)} ${day}`
      return { key, label, sort: year * 10000 + mon * 100 + day }
    }
  }
  // ISO-ish fallback (YYYY-MM-DD...)
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, y, mo, d] = iso
    return {
      key: `${y}-${mo}-${d}`,
      label: `${mo}/${d}`,
      sort: +y * 10000 + +mo * 100 + +d,
    }
  }
  return null
}

function detectCurrency(rows: Array<Record<string, unknown>>, moneyCols: string[]): string {
  for (const row of rows.slice(0, 50)) {
    for (const col of moneyCols) {
      const v = row[col]
      if (typeof v === 'string') {
        for (const { re, code } of CURRENCY_SYMBOLS) {
          if (re.test(v)) return code
        }
      }
    }
  }
  return 'USD'
}

/* ------------------------------------------------------------------ *
 * Row -> OrderItem
 * ------------------------------------------------------------------ */

function buildItem(
  raw: Record<string, unknown>,
  m: ColumnMapping,
  index: number,
): OrderItem {
  const get = (f: FieldKey): unknown => (m[f] ? raw[m[f] as string] : undefined)

  const qtyPurchased = toNumber(get('qtyPurchased'))
  const qtyShipped = toNumber(get('qtyShipped'))
  const qtyToShip = toNumber(get('qtyToShip'))
  const qtyCanceled = toNumber(get('qtyCanceled'))

  // Revenue: retail price total (a line total) is best; fall back to per-unit
  // prices × quantity.
  const retail = toNumber(get('retailPriceTotal'))
  const goodsBase = toNumber(get('goodsBasePrice'))
  const activityBase = toNumber(get('activityGoodsBasePrice'))
  const units = qtyPurchased || 1
  let revenue = retail
  if (revenue <= 0) revenue = (activityBase || goodsBase) * units

  const discount = toNumber(get('discountTemu')) + toNumber(get('discountSeller'))

  const orderId = toStr(get('orderId')) || `ROW-${index + 1}`
  const sku = toStr(get('contributionSku')) || toStr(get('skuId'))
  const status = toStr(get('status')) || toStr(get('itemStatus')) || 'Unknown'
  const purchaseDateRaw = toStr(get('purchaseDate'))

  return {
    id: `${orderId}-${toStr(get('orderItemId')) || index}`,
    orderId,
    orderItemId: toStr(get('orderItemId')),
    status,
    fulfillmentMode: toStr(get('fulfillmentMode')),
    productName: toStr(get('productName')) || sku || orderId,
    variation: toStr(get('variation')),
    sku: sku || '—',
    qtyPurchased,
    qtyShipped,
    qtyToShip,
    qtyCanceled,
    revenue,
    goodsBasePrice: goodsBase,
    shippingCost: toNumber(get('shippingCost')),
    taxTotal: toNumber(get('taxTotal')),
    discount,
    carrier: toStr(get('carrier')) || '—',
    trackingNumber: toStr(get('trackingNumber')),
    settlementStatus: toStr(get('settlementStatus')),
    city: toStr(get('city')),
    state: toStr(get('state')),
    country: toStr(get('country')) || '—',
    purchaseDate: parsePurchaseDate(purchaseDateRaw),
    purchaseDateRaw,
    awaitingShipment: qtyToShip > 0,
    raw,
  }
}

function computeKpis(items: OrderItem[]): Kpis {
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)
  const unitsSold = items.reduce((s, i) => s + i.qtyPurchased, 0)
  const orderIds = new Set(items.map((i) => i.orderId))
  const awaitingShipment = items.filter((i) => i.awaitingShipment).length
  const canceledUnits = items.reduce((s, i) => s + i.qtyCanceled, 0)
  const totalDiscount = items.reduce((s, i) => s + i.discount, 0)

  return {
    totalRevenue,
    unitsSold,
    orderCount: orderIds.size,
    itemCount: items.length,
    avgOrderValue: orderIds.size > 0 ? totalRevenue / orderIds.size : 0,
    awaitingShipment,
    canceledUnits,
    totalDiscount,
  }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function parseWorkbook(buffer: ArrayBuffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  if (workbook.SheetNames.length === 0) {
    throw new Error('The workbook contains no sheets.')
  }

  const sheetName = pickSheet(workbook)
  const sheet = workbook.Sheets[sheetName]
  fixSheetRange(sheet)

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })
  if (aoa.length === 0) {
    throw new Error(`Sheet "${sheetName}" has no rows.`)
  }

  const headerRowIdx = findHeaderRow(aoa)
  const headers = (aoa[headerRowIdx] ?? []).map((h) => toStr(h))
  const mapping = detectColumns(headers)

  if (mapping.orderId == null && mapping.productName == null) {
    throw new Error(
      `Could not find an order header row in sheet "${sheetName}". Expected columns like "Order ID" / "product name".`,
    )
  }

  // Build records keyed by header for the data rows below the header row.
  const dataRows = aoa.slice(headerRowIdx + 1)
  const records: Array<Record<string, unknown>> = dataRows
    .map((row) => {
      const rec: Record<string, unknown> = {}
      headers.forEach((h, c) => {
        if (h) rec[h] = (row as unknown[])[c] ?? ''
      })
      return rec
    })
    .filter((rec) => Object.values(rec).some((v) => v !== '' && v != null))

  if (records.length === 0) {
    throw new Error(`Sheet "${sheetName}" has headers but no order rows.`)
  }

  const moneyCols = [
    mapping.retailPriceTotal,
    mapping.goodsBasePrice,
    mapping.activityGoodsBasePrice,
    mapping.shippingCost,
    mapping.discountTemu,
  ].filter(Boolean) as string[]
  const currency = detectCurrency(records, moneyCols)

  const items = records.map((r, i) => buildItem(r, mapping, i))

  const warnings: string[] = []
  if (!mapping.retailPriceTotal && !mapping.goodsBasePrice && !mapping.activityGoodsBasePrice) {
    warnings.push('No price/revenue column detected — revenue metrics may read as zero.')
  }
  if (!mapping.status && !mapping.itemStatus) {
    warnings.push('No order-status column detected — status breakdown is unavailable.')
  }
  if (!mapping.purchaseDate) {
    warnings.push('No purchase-date column detected — the sales-over-time trend is hidden.')
  }

  return {
    items,
    kpis: computeKpis(items),
    mapping,
    headers,
    sheetName,
    fileName,
    rowCount: records.length,
    currency,
    warnings,
  }
}

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
