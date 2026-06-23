// Intelligent invoice cost extraction.
//
// Two paths:
//   • Structured (.csv / .xlsx): SheetJS -> find SKU + cost columns by header,
//     with a broken-range fix (Temu-style) and header-row detection.
//   • PDF (.pdf): pdfjs text layer across ALL pages -> cleaned, continuous line
//     stream -> windowed regex that tolerates the SKU and its price living on
//     different lines (common in multi-page invoices like INV-Z004338).
//
// Output is a list of {sku, unitCost} pairs the caller folds into costRegistry.
import * as XLSX from 'xlsx'
import { skuKey, normSku } from './costModel'

export interface ExtractedCost {
  sku: string
  /** Best-effort product name / description pulled from the invoice line(s). */
  productName?: string
  unitCost: number
  currency?: string
  /** Where the value came from (per-file diagnostics / review UI). */
  source?: string
  /** How we matched it — useful for the review modal confidence hints. */
  method?: 'labelled' | 'inline' | 'loose'
}

export interface InvoiceResult {
  costs: ExtractedCost[]
  /** Human-readable note about what was found / not found. */
  summary: string
  warnings: string[]
  /** Pages processed (PDF only). */
  pages?: number
}

const SKU_HEADERS = ['sku', 'skuid', 'productid', 'itemid', 'contributionsku', 'item', 'code', 'partno', 'partnumber', 'model']
const COST_HEADERS = ['unitcost', 'cost', 'netprice', 'unitprice', 'price', 'costprice', 'buyprice', 'wholesale', 'net', 'rate']
const NAME_HEADERS = ['productname', 'description', 'itemdescription', 'name', 'title', 'product', 'itemname']

const CURRENCY_SYMBOLS: Array<{ re: RegExp; code: string }> = [
  { re: /£/, code: 'GBP' },
  { re: /€/, code: 'EUR' },
  { re: /\$/, code: 'USD' },
]

const normalize = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Coerce a cell to a clean scalar string (never "[object Object]"/array dumps). */
function cellStr(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  if (Array.isArray(value)) {
    const first = value.find((v) => v != null && v !== '')
    return first == null ? '' : cellStr(first)
  }
  if (typeof value === 'object') {
    const cell = value as { w?: unknown; v?: unknown }
    if (cell.w != null) return cellStr(cell.w)
    if (cell.v != null) return cellStr(cell.v)
    const first = Object.values(value as Record<string, unknown>).find((v) => v != null && v !== '')
    return first == null ? '' : cellStr(first)
  }
  return String(value).trim()
}

function toNumber(value: unknown): number {
  if (value == null || value === '') return NaN
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const cleaned = String(value).replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : NaN
}

function detectCurrency(text: string): string | undefined {
  for (const { re, code } of CURRENCY_SYMBOLS) if (re.test(text)) return code
  return undefined
}

/* ----------------------- Structured (CSV / XLSX) -------------------- */

function fixRange(ws: XLSX.WorkSheet): void {
  const addrs = Object.keys(ws).filter((k) => !k.startsWith('!'))
  if (!addrs.length) return
  let minR = Infinity, minC = Infinity, maxR = 0, maxC = 0
  for (const a of addrs) {
    const c = XLSX.utils.decode_cell(a)
    minR = Math.min(minR, c.r); minC = Math.min(minC, c.c)
    maxR = Math.max(maxR, c.r); maxC = Math.max(maxC, c.c)
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } })
}

/** Find the row index whose cells best match SKU/cost header tokens. */
function findHeaderRow(aoa: unknown[][]): number {
  const limit = Math.min(aoa.length, 30)
  let bestRow = 0
  let bestScore = -1
  for (let r = 0; r < limit; r++) {
    const row = aoa[r] ?? []
    let score = 0
    for (const cell of row) {
      const n = normalize(cell)
      if (!n) continue
      if (SKU_HEADERS.includes(n)) score += 10
      if (COST_HEADERS.includes(n)) score += 10
    }
    if (score > bestScore) {
      bestScore = score
      bestRow = r
    }
  }
  return bestScore > 0 ? bestRow : 0
}

function extractFromSheet(buffer: ArrayBuffer, source: string, validSkus?: Set<string>): InvoiceResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const warnings: string[] = []
  const costs: ExtractedCost[] = []
  const gate = validSkus && validSkus.size > 0 ? validSkus : null

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    fixRange(ws)
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false })
    if (!aoa.length) continue

    const headerRow = findHeaderRow(aoa)
    const headers = (aoa[headerRow] ?? []).map((h) => normalize(h))
    const skuCol = headers.findIndex((h) => SKU_HEADERS.includes(h))
    const costCol = headers.findIndex((h) => COST_HEADERS.includes(h))
    const nameCol = headers.findIndex((h) => NAME_HEADERS.includes(h))
    if (skuCol === -1 || costCol === -1) continue

    for (const row of aoa.slice(headerRow + 1)) {
      const r = row as unknown[]
      const sku = cellStr(r[skuCol])
      const cost = toNumber(r[costCol])
      if (!sku || !Number.isFinite(cost) || cost <= 0) continue
      // When the Temu whitelist is active, only accept SKUs that exist in it.
      if (gate && !gate.has(sku.toUpperCase())) continue
      const productName = nameCol !== -1 ? cellStr(r[nameCol]) : undefined
      costs.push({ sku, productName, unitCost: cost, currency: detectCurrency(String(r[costCol])), source, method: 'inline' })
    }
    if (costs.length) break // first sheet with usable columns wins
  }

  const deduped = dedupe(costs)
  if (!deduped.length) {
    warnings.push('No SKU + cost column pair was found in this spreadsheet.')
  }
  return {
    costs: deduped,
    summary: `${deduped.length} cost ${deduped.length === 1 ? 'entry' : 'entries'} extracted from spreadsheet.`,
    warnings,
  }
}

/* ------------------------------ PDF -------------------------------- */

/**
 * Pull text from EVERY page and reconstruct visual lines (grouping text items by
 * Y coordinate). Returns one flat array of lines for the whole document so the
 * matcher can see items even when a row splits across a page break.
 */
async function pdfToLines(buffer: ArrayBuffer): Promise<{ lines: string[]; pages: number }> {
  // Lazy import so the heavy pdfjs bundle only loads when a PDF is uploaded.
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const rows = new Map<number, Array<{ x: number; s: string }>>()
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y)!.push({ x, s: item.str })
    }
    const sortedY = [...rows.keys()].sort((a, b) => b - a) // top-to-bottom
    for (const y of sortedY) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((c) => c.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line) lines.push(line)
    }
  }
  return { lines, pages: doc.numPages }
}

// Lines that are just page chrome and should be stripped before matching.
const PAGE_NUMBER_RE = /^(page\s*)?\d+\s*(of|\/)\s*\d+$/i
const PAGE_WORD_RE = /^page\s+\d+$/i
// A repeated table header row, e.g. "# Item & Description EAN Qty Rate Amount".
const TABLE_HEADER_RE = /\b(item|description)\b/i
const HEADER_KEYWORDS = ['item', 'description', 'ean', 'qty', 'quantity', 'rate', 'amount', 'unit', 'price', 'sku', 'hsn', 'tax', 'total']

function looksLikeTableHeader(line: string): boolean {
  if (!TABLE_HEADER_RE.test(line)) return false
  const tokens = line.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  if (tokens.length === 0) return false
  const hits = tokens.filter((t) => HEADER_KEYWORDS.includes(t)).length
  // Mostly header keywords + no decimal money -> it's a header, not a data row.
  return hits >= 2 && hits / tokens.length >= 0.5 && !/\d+[.,]\d{2}/.test(line)
}

// Recurring per-page footers/continuation markers that split items across page
// breaks. Stripping them keeps a product name from being separated from its row.
const FOOTER_RE = /^(continued( on next page)?\.{0,3}|carried (forward|over)|brought forward|thank you[\s\S]*|page\s+\d+\s+of\s+\d+.*|www\.[^\s]+|registered (office|in)\b.*|company (no|reg)\b.*)$/i

/**
 * Strip page numbers, repeated table headers, and recurring page footers so the
 * regex views the whole multi-page document as one continuous stream (and items
 * straddling a page break aren't dropped).
 */
export function cleanInvoiceLines(lines: string[]): string[] {
  return lines.filter((raw) => {
    const line = raw.trim()
    if (!line) return false
    if (PAGE_NUMBER_RE.test(line)) return false
    if (PAGE_WORD_RE.test(line)) return false
    if (FOOTER_RE.test(line)) return false
    if (looksLikeTableHeader(line)) return false
    return true
  })
}

/* --------------------------- Matchers ------------------------------ */

// A money amount, optionally currency-prefixed. Group 1 = numeric part.
const MONEY_G = /(?:[£€$]\s?)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d{1,6}(?:\.\d{1,2}))/g

// ---- STRICT SKU isolation -------------------------------------------------
// Suppliers' contribution-sku format ONLY: 2–4 uppercase letters, a dash, then
// 2–6 digits, with an optional short variant suffix (e.g. BM-134, DK-068,
// MR-1113, DK-526-BLK). Nothing else qualifies.
const SUPPLIER_SKU = /[A-Z]{2,4}-\d{2,6}(?:-[A-Z0-9]{1,6})?/
const SUPPLIER_SKU_EXACT = new RegExp(`^${SUPPLIER_SKU.source}$`)
const SKU_IN_LINE = new RegExp(`\\b(${SUPPLIER_SKU.source})\\b`, 'g')
// Explicitly labelled SKU, e.g. "SKU: MR-1113" / "SKU MR-1113".
const LABELLED_SKU = /\bSKU\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{1,23})\b/i
// Prefixes that share the LETTERS-DIGITS shape but are NEVER product SKUs —
// invoice/reference/billing codes (INV-2024), tax/account refs, month names.
const BLOCKED_PREFIX = new Set([
  'INV', 'PO', 'REF', 'VAT', 'GB', 'EAN', 'ORD', 'ACC', 'BILL', 'TEL', 'FAX', 'NO', 'ID',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
])
// Lines that are invoice metadata, not product rows — the unlabelled matcher
// must never scan these (e.g. "Invoice INV-Z004338", "Order No ...", dates).
const METADATA_LINE = /\b(invoice|inv|subtotal|sub-total|total|balance|vat|tax|gst|hsn|date|due|order\s*no|po\s*number|account|iban|sort\s*code|tel|phone|email)\b/i

/**
 * A code is a valid product SKU only if it matches the supplier LETTERS-DIGITS
 * format AND its alpha prefix isn't a known invoice/reference/date marker. This
 * blocks dates (DD/MM/YYYY — no match), invoice numbers (INV-…, Z…), and refs.
 */
function isValidSku(raw: string): boolean {
  const t = raw.trim().toUpperCase()
  if (!SUPPLIER_SKU_EXACT.test(t)) return false
  return !BLOCKED_PREFIX.has(t.split('-')[0])
}

/** First valid supplier SKU appearing in a line, or null. */
function skuInLine(line: string): string | null {
  SKU_IN_LINE.lastIndex = 0
  for (const m of line.matchAll(SKU_IN_LINE)) {
    if (isValidSku(m[1])) return m[1]
  }
  return null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a line-level SKU detector.
 *  • When `validSkus` (the Temu sheet's `contribution sku` set) is provided, a
 *    string is a SKU ONLY if it is one of those exact codes — the spreadsheet
 *    is the authoritative whitelist, so dates/refs/memos can never match.
 *  • Otherwise fall back to the strict supplier-format matcher (labelled
 *    `SKU:` first, then a bare LETTERS-DIGITS code on a non-metadata row).
 */
function makeSkuDetector(validSkus?: Set<string>): (line: string) => string | null {
  if (validSkus && validSkus.size > 0) {
    const alt = [...validSkus]
      .sort((a, b) => b.length - a.length) // prefer the longest match
      .map(escapeRegExp)
      .join('|')
    const re = new RegExp(`\\b(${alt})\\b`, 'i')
    return (line) => {
      const m = line.match(re)
      return m ? normSku(m[1]) : null
    }
  }
  return (line) => {
    const labelled = line.match(LABELLED_SKU)
    if (labelled && isValidSku(labelled[1])) return labelled[1]
    if (!METADATA_LINE.test(line)) return skuInLine(line)
    return null
  }
}

function parseMoney(token: string): number {
  return parseFloat(token.replace(/,/g, ''))
}

/** All money amounts on a line (numeric values). */
function moneyOnLine(line: string): number[] {
  const out: number[] = []
  for (const m of line.matchAll(MONEY_G)) {
    const n = parseMoney(m[1])
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return out
}

/**
 * Given a quantity hint and a list of money amounts on a row, choose the UNIT
 * cost. Invoice rows are usually "... Qty Rate Amount" where Amount = Qty*Rate.
 * If we can find amounts a and b with a*qty ≈ b, the smaller is the unit rate.
 */
function pickUnitCost(amounts: number[], qty: number | null): number | null {
  if (amounts.length === 0) return null
  if (amounts.length === 1) return amounts[0]

  // Try to detect Rate vs Amount via qty relationship.
  if (qty && qty > 1) {
    for (let i = 0; i < amounts.length; i++) {
      for (let j = 0; j < amounts.length; j++) {
        if (i === j) continue
        const rate = amounts[i]
        const amount = amounts[j]
        if (Math.abs(rate * qty - amount) <= 0.05) return rate
      }
    }
  }
  // Otherwise prefer the last "rate-like" amount that is not the largest total.
  const sorted = [...amounts].sort((a, b) => a - b)
  // Heuristic: take the median-ish lower value (unit price < line total).
  return sorted[0]
}

/** Extract a plausible quantity from a line (first standalone small integer). */
function qtyOnLine(line: string): number | null {
  // Look for explicit "Qty 3" or "3 x" patterns first.
  const explicit = line.match(/\bqty\D{0,3}(\d{1,4})\b/i) ?? line.match(/\b(\d{1,4})\s*(?:x|×|pcs|units)\b/i)
  if (explicit) return parseInt(explicit[1], 10)
  // Fall back to a small integer that is not part of a decimal.
  const m = line.match(/(?<![\d.])\b(\d{1,3})\b(?![\d.])/)
  return m ? parseInt(m[1], 10) : null
}

// Document-structure / financial lines that are never product names. Narrower
// than METADATA_LINE on purpose: words like "phone"/"account" legitimately
// appear in product names ("Magnetic Phone Mount"), so they must NOT be here.
const NAME_REJECT = /\b(invoice|subtotal|sub-total|grand\s*total|total|balance|amount\s*due|vat|gst|hsn|iban|sort\s*code)\b/i

/** Does this line read like a product description (words, not money/metadata)? */
function looksLikeName(line: string): boolean {
  if (NAME_REJECT.test(line)) return false
  const letters = (line.match(/[A-Za-z]/g) ?? []).length
  const words = line.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w))
  return letters >= 5 && words.length >= 2
}

/** Strip SKU labels, a leading line index, money amounts and EAN codes from a name. */
function cleanName(line: string, sku?: string): string {
  let s = line
    .replace(/\bSKU\s*[:#]?\s*[A-Z0-9\-_/]+/gi, ' ') // "SKU: MR1070"
    .replace(/\bEAN\s*:?\s*\d+/gi, ' ') // EAN barcodes
    .replace(/(?:[£€$]\s?)?\d[\d,]*\.\d{1,2}/g, ' ') // money
    .replace(/^\s*\d{1,3}[).]?\s+/, ' ') // leading "1 " / "1) " item index
  if (sku) s = s.replace(new RegExp(sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  return s.replace(/\s+/g, ' ').trim().slice(0, 80)
}

/**
 * Find the product name for a matched SKU at line `i`. The description usually
 * sits ON the SKU line (inline) or one/two lines ABOVE it (labelled/loose),
 * so we probe a small window and keep the first line that reads like a name.
 */
function findName(lines: string[], i: number, sku: string): string {
  const probe = [lines[i], lines[i - 1], lines[i - 2], lines[i + 1]]
  for (const cand of probe) {
    if (cand && looksLikeName(cand)) {
      const n = cleanName(cand, sku)
      if (n.length >= 3) return n
    }
  }
  return cleanName(lines[i] ?? '', sku)
}

/**
 * Find the unit cost nearest to a SKU occurrence on line `idx`. Looks on the SKU
 * line first, then fans outward — DOWN before UP at each distance — because an
 * invoice row's price usually sits to the right (same line) or just below it.
 */
function priceNear(lines: string[], idx: number): { cost: number | null; line: string } {
  const WINDOW = 4
  const here = moneyOnLine(lines[idx])
  if (here.length) {
    const unit = pickUnitCost(here, qtyOnLine(lines[idx]))
    if (unit != null) return { cost: unit, line: lines[idx] }
  }
  for (let k = 1; k <= WINDOW; k++) {
    for (const j of [idx + k, idx - k]) {
      if (j < 0 || j >= lines.length) continue
      const amounts = moneyOnLine(lines[j])
      if (amounts.length) {
        const unit = pickUnitCost(amounts, qtyOnLine(lines[j]))
        if (unit != null) return { cost: unit, line: lines[j] }
      }
    }
  }
  return { cost: null, line: lines[idx] ?? '' }
}

/**
 * WHITELIST-DRIVEN extraction. The Temu sheet's `contribution sku` set is the
 * single source of truth: we scan the ENTIRE document text for the EXACT codes
 * in that list (all occurrences, all pages) and, for each one found, grab its
 * adjacent unit price. Anything outside the whitelist — dates, invoice numbers,
 * tracking refs, statement text — can never be captured.
 *
 * STRICT: a match produces a row ONLY when a real (> 0) price is found beside it.
 * Codes without a recoverable price are dropped, never emitted as blank rows or
 * placeholder objects.
 */
function extractByWhitelist(lines: string[], validSkus: Set<string>, source: string): ExtractedCost[] {
  const skuList = [...validSkus].filter(Boolean).sort((a, b) => b.length - a.length) // longest first
  if (!skuList.length) return []
  // Match a whitelisted code only when it's not glued to other alphanumerics
  // (so "MR-1113" won't match inside "MR-11139"), but a trailing "-VARIANT" is ok.
  const re = new RegExp(`(?<![A-Z0-9])(${skuList.map(escapeRegExp).join('|')})(?![A-Z0-9])`, 'gi')

  // Pre-mark which lines themselves contain a whitelisted SKU. These act as hard
  // boundaries: when fanning out to find a price we must NOT cross into another
  // product's line, or a price-less SKU would steal its neighbour's price.
  const lineHasSku = lines.map((ln) => {
    re.lastIndex = 0
    return re.test(ln)
  })

  /** Nearest price to line `idx`, never crossing a line that holds another SKU. */
  const priceForRow = (idx: number): { cost: number | null; line: string } => {
    const here = moneyOnLine(lines[idx])
    if (here.length) {
      const unit = pickUnitCost(here, qtyOnLine(lines[idx]))
      if (unit != null) return { cost: unit, line: lines[idx] }
    }
    const WINDOW = 4
    let down = true
    let up = true
    for (let k = 1; k <= WINDOW; k++) {
      const dj = idx + k
      if (down && dj < lines.length) {
        if (lineHasSku[dj]) down = false // boundary: belongs to the next product
        else {
          const a = moneyOnLine(lines[dj])
          const u = a.length ? pickUnitCost(a, qtyOnLine(lines[dj])) : null
          if (u != null) return { cost: u, line: lines[dj] }
        }
      }
      const uj = idx - k
      if (up && uj >= 0) {
        if (lineHasSku[uj]) up = false // boundary: belongs to the previous product
        else {
          const a = moneyOnLine(lines[uj])
          const u = a.length ? pickUnitCost(a, qtyOnLine(lines[uj])) : null
          if (u != null) return { cost: u, line: lines[uj] }
        }
      }
      if (!down && !up) break
    }
    return { cost: null, line: lines[idx] ?? '' }
  }

  const out: ExtractedCost[] = []
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(lines[i])) !== null) {
      const sku = normSku(m[1])
      const { cost, line: priceLine } = priceForRow(i)
      if (cost == null || !(cost > 0)) continue // no price → not a real product row
      out.push({
        sku,
        productName: findName(lines, i, sku),
        unitCost: cost,
        currency: detectCurrency(priceLine),
        source,
        method: 'inline',
      })
    }
  }
  return dedupe(out)
}

/**
 * Matcher over the cleaned, continuous line stream.
 *  • When the Temu `contribution sku` whitelist is supplied, every whitelisted
 *    code found anywhere in the document is emitted with its nearest price
 *    (the authoritative path — see {@link extractByWhitelist}).
 *  • Otherwise fall back to the strict supplier-format regex, which still bars
 *    invoice IDs, dates and free text from being read as SKUs.
 */
export function extractCostsFromLines(
  lines: string[],
  source = 'pdf',
  validSkus?: Set<string>,
): ExtractedCost[] {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean)

  if (validSkus && validSkus.size > 0) {
    return extractByWhitelist(cleaned, validSkus, source)
  }

  const out: ExtractedCost[] = []
  const detectSku = makeSkuDetector(validSkus)

  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i]
    const sku = detectSku(line)
    if (!sku) continue
    const { cost, line: priceLine } = priceNear(cleaned, i)
    if (cost == null) continue
    out.push({
      sku,
      productName: findName(cleaned, i, sku),
      unitCost: cost,
      currency: detectCurrency(priceLine),
      source,
      method: 'inline',
    })
  }

  return dedupe(out)
}

async function extractFromPdf(
  buffer: ArrayBuffer,
  source: string,
  validSkus?: Set<string>,
): Promise<InvoiceResult> {
  const { lines, pages } = await pdfToLines(buffer)
  const cleaned = cleanInvoiceLines(lines)
  const costs = extractCostsFromLines(cleaned, source, validSkus)
  const warnings: string[] = []
  if (!costs.length) {
    warnings.push(
      'No SKU/cost pairs found in the PDF text. If this is a scanned image invoice, OCR would be required.',
    )
  }
  return {
    costs,
    summary: `${costs.length} cost ${costs.length === 1 ? 'entry' : 'entries'} extracted from ${pages} page(s).`,
    warnings,
    pages,
  }
}

/* ----------------------------- shared ------------------------------ */

/** Collapse repeated SKU occurrences into one entry. Later lines override
 *  earlier ones, but a price-less duplicate must NOT wipe out a price we already
 *  captured, and a missing name/currency falls back to the earlier match. */
function dedupe(costs: ExtractedCost[]): ExtractedCost[] {
  const map = new Map<string, ExtractedCost>()
  for (const c of costs) {
    const key = skuKey(c.sku)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, c)
      continue
    }
    map.set(key, {
      ...c,
      unitCost: c.unitCost > 0 ? c.unitCost : prev.unitCost,
      productName: c.productName || prev.productName,
      currency: c.currency || prev.currency,
    })
  }
  return [...map.values()]
}

/** Entry point for a single file: route by extension. */
export async function extractInvoice(file: File, validSkus?: Set<string>): Promise<InvoiceResult> {
  const name = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()

  if (name.endsWith('.pdf')) {
    return extractFromPdf(buffer, file.name, validSkus)
  }
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return extractFromSheet(buffer, file.name, validSkus)
  }
  throw new Error('Unsupported invoice type. Use .pdf, .csv, .xlsx or .xls.')
}

export interface BulkInvoiceResult {
  /** Merged, de-duplicated costs across all files (later files win per SKU). */
  costs: ExtractedCost[]
  /** Per-file breakdown for diagnostics / the review modal. */
  perFile: Array<{ fileName: string; count: number; pages?: number; warnings: string[]; error?: string }>
  totalFiles: number
  okFiles: number
}

/**
 * Bulk ingestion: process many invoice files sequentially (keeps memory + the
 * pdfjs worker calm) and merge their extracted costs. A failing file does not
 * abort the batch — its error is recorded and the rest continue.
 */
export async function extractInvoiceFiles(
  files: File[],
  onProgress?: (done: number, total: number, fileName: string) => void,
  validSkus?: Set<string>,
): Promise<BulkInvoiceResult> {
  const all: ExtractedCost[] = []
  const perFile: BulkInvoiceResult['perFile'] = []
  let okFiles = 0

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx]
    onProgress?.(idx, files.length, file.name)
    try {
      const res = await extractInvoice(file, validSkus)
      all.push(...res.costs)
      perFile.push({ fileName: file.name, count: res.costs.length, pages: res.pages, warnings: res.warnings })
      okFiles++
    } catch (err) {
      perFile.push({
        fileName: file.name,
        count: 0,
        warnings: [],
        error: err instanceof Error ? err.message : 'Failed to read file.',
      })
    }
  }
  onProgress?.(files.length, files.length, '')

  return {
    costs: dedupe(all),
    perFile,
    totalFiles: files.length,
    okFiles,
  }
}
