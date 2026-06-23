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
import { skuKey } from './costModel'

export interface ExtractedCost {
  sku: string
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

const CURRENCY_SYMBOLS: Array<{ re: RegExp; code: string }> = [
  { re: /£/, code: 'GBP' },
  { re: /€/, code: 'EUR' },
  { re: /\$/, code: 'USD' },
]

const normalize = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

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

function extractFromSheet(buffer: ArrayBuffer, source: string): InvoiceResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const warnings: string[] = []
  const costs: ExtractedCost[] = []

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    fixRange(ws)
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false })
    if (!aoa.length) continue

    const headerRow = findHeaderRow(aoa)
    const headers = (aoa[headerRow] ?? []).map((h) => normalize(h))
    const skuCol = headers.findIndex((h) => SKU_HEADERS.includes(h))
    const costCol = headers.findIndex((h) => COST_HEADERS.includes(h))
    if (skuCol === -1 || costCol === -1) continue

    for (const row of aoa.slice(headerRow + 1)) {
      const r = row as unknown[]
      const sku = String(r[skuCol] ?? '').trim()
      const cost = toNumber(r[costCol])
      if (!sku || !Number.isFinite(cost) || cost <= 0) continue
      costs.push({ sku, unitCost: cost, currency: detectCurrency(String(r[costCol])), source, method: 'inline' })
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

/**
 * Strip page numbers and repeated table headers so the regex views the whole
 * document as a single continuous stream.
 */
export function cleanInvoiceLines(lines: string[]): string[] {
  return lines.filter((raw) => {
    const line = raw.trim()
    if (!line) return false
    if (PAGE_NUMBER_RE.test(line)) return false
    if (PAGE_WORD_RE.test(line)) return false
    if (looksLikeTableHeader(line)) return false
    return true
  })
}

/* --------------------------- Matchers ------------------------------ */

// A money amount, optionally currency-prefixed. Group 1 = numeric part.
const MONEY_G = /(?:[£€$]\s?)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d{1,6}(?:\.\d{1,2}))/g
// Inline SKU-ish token (same-line case).
const SKU_TOKEN = /\b([A-Z0-9][A-Z0-9\-_/]{2,23})\b/
// Explicitly labelled SKU, e.g. "SKU: MR1070-BLK".
const LABELLED_SKU = /\bSKU\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_/]{1,23})\b/i
// A loose product code like "MR1070-" or "AB-1207" — letters then digits with a
// dash, the shape vendors use for catalogue codes.
const LOOSE_CODE = /\b([A-Z]{1,5}\d{2,6}[A-Z0-9\-]{0,8})\b/
// Lines that are invoice metadata, not product rows — the loose matcher (which
// is the least precise) must not fire on these (e.g. "Invoice INV-Z004338").
const METADATA_LINE = /\b(invoice|inv|subtotal|sub-total|total|balance|vat|tax|gst|hsn|date|due|order\s*no|po\s*number|account|iban|sort\s*code|tel|phone|email)\b/i

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

/**
 * Windowed matcher over the cleaned, continuous line stream. Handles three
 * shapes, in priority order per anchor:
 *   1. labelled  — "SKU: CODE" anywhere; price taken from same or nearby lines.
 *   2. inline    — CODE and price on the same line.
 *   3. loose     — a loose catalogue code (MR1070-) with price within a window.
 */
export function extractCostsFromLines(lines: string[], source = 'pdf'): ExtractedCost[] {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean)
  const out: ExtractedCost[] = []
  const WINDOW = 3 // how many following lines to scan for a price

  const priceFromWindow = (startIdx: number): { cost: number | null; line: string } => {
    for (let k = 0; k <= WINDOW && startIdx + k < cleaned.length; k++) {
      const ln = cleaned[startIdx + k]
      const amounts = moneyOnLine(ln)
      if (amounts.length) {
        const qty = qtyOnLine(ln)
        const unit = pickUnitCost(amounts, qty)
        if (unit != null) return { cost: unit, line: ln }
      }
    }
    return { cost: null, line: cleaned[startIdx] ?? '' }
  }

  for (let i = 0; i < cleaned.length; i++) {
    const line = cleaned[i]

    // 1) Labelled SKU has highest confidence.
    const labelled = line.match(LABELLED_SKU)
    if (labelled) {
      const sku = labelled[1]
      // price may be on this line (after the label) or following lines.
      const { cost, line: priceLine } = priceFromWindow(i)
      if (cost != null) {
        out.push({ sku, unitCost: cost, currency: detectCurrency(priceLine), source, method: 'labelled' })
        continue
      }
    }

    // 2) Inline: a SKU-ish token AND money on the same line.
    const inlineAmounts = moneyOnLine(line)
    if (inlineAmounts.length) {
      const tok = line.match(SKU_TOKEN)
      if (tok) {
        const sku = tok[1]
        if (/\d/.test(sku) || sku.includes('-')) {
          // Avoid treating the money itself as the SKU.
          if (!/^\d+([.,]\d+)?$/.test(sku)) {
            const qty = qtyOnLine(line)
            const unit = pickUnitCost(inlineAmounts, qty)
            if (unit != null) {
              out.push({ sku, unitCost: unit, currency: detectCurrency(line), source, method: 'inline' })
              continue
            }
          }
        }
      }
    }

    // 3) Loose catalogue code with a price in the window. Skip metadata lines
    //    (invoice numbers, totals, VAT) so we don't mistake them for SKUs.
    const loose = !METADATA_LINE.test(line) ? line.match(LOOSE_CODE) : null
    if (loose) {
      const sku = loose[1]
      const { cost, line: priceLine } = priceFromWindow(i)
      if (cost != null) {
        out.push({ sku, unitCost: cost, currency: detectCurrency(priceLine), source, method: 'loose' })
      }
    }
  }

  return dedupe(out)
}

async function extractFromPdf(buffer: ArrayBuffer, source: string): Promise<InvoiceResult> {
  const { lines, pages } = await pdfToLines(buffer)
  const cleaned = cleanInvoiceLines(lines)
  const costs = extractCostsFromLines(cleaned, source)
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

/** Keep the last-seen cost per normalized SKU (later lines override earlier). */
function dedupe(costs: ExtractedCost[]): ExtractedCost[] {
  const map = new Map<string, ExtractedCost>()
  for (const c of costs) map.set(skuKey(c.sku), c)
  return [...map.values()]
}

/** Entry point for a single file: route by extension. */
export async function extractInvoice(file: File): Promise<InvoiceResult> {
  const name = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()

  if (name.endsWith('.pdf')) {
    return extractFromPdf(buffer, file.name)
  }
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return extractFromSheet(buffer, file.name)
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
): Promise<BulkInvoiceResult> {
  const all: ExtractedCost[] = []
  const perFile: BulkInvoiceResult['perFile'] = []
  let okFiles = 0

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx]
    onProgress?.(idx, files.length, file.name)
    try {
      const res = await extractInvoice(file)
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
