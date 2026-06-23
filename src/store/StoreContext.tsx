import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as db from '../lib/db'
import type { AccountRecord, CostEntry, ProductRecord, StoredOrderItem } from '../lib/db'
import { parseExcelFile } from '../lib/parseExcel'
import { extractInvoiceFiles, type BulkInvoiceResult, type ExtractedCost } from '../lib/invoiceExtract'
import { applyCosts, buildCostMap, computeCostedKpis, normSku, skuKey, type CostedItem, type CostedKpis } from '../lib/costModel'

/** Default supplier markup: target retail = cost × 1.20 (20% markup). */
export const DEFAULT_MARKUP = 1.2
const round2 = (n: number) => Math.round(n * 100) / 100

/** A stable id generator that does not use Math.random (sandbox-safe). */
let idCounter = 0
function makeId(prefix: string): string {
  idCounter += 1
  const t = typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : idCounter
  return `${prefix}_${t}_${idCounter}`
}

export interface ActiveDataset {
  items: CostedItem[]
  kpis: CostedKpis
  /** Currency inferred from the account's order items, else 'USD'. */
  currency: string
}

/** A reviewable extracted product row for the "Load Products" modal. */
export interface ReviewRow extends ExtractedCost {
  /** Stable row id for the review UI. */
  rowId: string
  /** Product name/description (always present for the UI). */
  productName: string
  /** Target retail price = costPrice × markup, editable before commit. */
  targetListingPrice: number
  /** How many of the active account's items this SKU would reconcile. */
  matchCount: number
  /** Whether the user has it selected to commit. */
  selected: boolean
}

export interface InvoicePreview {
  rows: ReviewRow[]
  perFile: BulkInvoiceResult['perFile']
  totalFiles: number
  okFiles: number
  /** How many rows were auto-priced from the invoices (rest need manual entry). */
  hydrated: number
}

export interface BulkProgress {
  done: number
  total: number
  fileName: string
}

interface StoreState {
  ready: boolean
  accounts: AccountRecord[]
  activeAccountId: string | null
  activeAccount: AccountRecord | null
  costRegistry: CostEntry[]
  /** Global product catalog registered from supplier invoices. */
  products: ProductRecord[]
  dataset: ActiveDataset | null
  /** Transient status for uploads. */
  busy: boolean
  /** Live progress while a bulk invoice batch is processing. */
  bulkProgress: BulkProgress | null
  notice: string | null
}

interface StoreActions {
  createAccount: (sellerName: string) => Promise<string>
  selectAccount: (id: string) => void
  deleteAccount: (id: string) => Promise<void>
  /** Upload a Temu order sheet under the active account; persists rows. */
  ingestOrderSheet: (file: File) => Promise<void>
  /**
   * Extract products (SKU + name + cost, with a 20% target retail price) from
   * one or more invoice files WITHOUT committing them. Returns a preview for the
   * "Load Products" review modal.
   */
  previewInvoices: (files: File[]) => Promise<InvoicePreview>
  /** Persist the chosen reviewed products to IndexedDB + reconcile sales in real time. */
  commitProducts: (rows: ReviewRow[]) => Promise<{ matched: number; committed: number }>
  clearNotice: () => void
}

type StoreValue = StoreState & StoreActions

const StoreCtx = createContext<StoreValue | null>(null)

const LS_ACTIVE = 'temu.activeAccountId'

function inferCurrency(items: StoredOrderItem[]): string {
  // Order items don't carry a currency field individually, so default to USD
  // unless a £/€ appears in raw price strings.
  for (const it of items.slice(0, 30)) {
    const raw = JSON.stringify(it.raw)
    if (raw.includes('£')) return 'GBP'
    if (raw.includes('€')) return 'EUR'
  }
  return 'USD'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [costRegistry, setCostRegistry] = useState<CostEntry[]>([])
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [items, setItems] = useState<StoredOrderItem[]>([])
  const [busy, setBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Initial hydrate from IndexedDB.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [accs, costs, prods] = await Promise.all([
        db.getAccounts(),
        db.getCostRegistry(),
        db.getProducts(),
      ])
      if (cancelled) return
      setAccounts(accs)
      setCostRegistry(costs)
      setProducts(prods)
      const stored = localStorage.getItem(LS_ACTIVE)
      const initial = accs.find((a) => a.id === stored)?.id ?? accs[0]?.id ?? null
      setActiveAccountId(initial)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Load the active account's items whenever the selection changes.
  useEffect(() => {
    if (!activeAccountId) {
      setItems([])
      return
    }
    let cancelled = false
    localStorage.setItem(LS_ACTIVE, activeAccountId)
    ;(async () => {
      const rows = await db.getItemsForAccount(activeAccountId)
      if (!cancelled) setItems(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [activeAccountId])

  const createAccount = useCallback(async (sellerName: string) => {
    const name = sellerName.trim() || 'Untitled Store'
    const now = Date.now()
    const record: AccountRecord = { id: makeId('acc'), sellerName: name, createdAt: now, updatedAt: now }
    await db.putAccount(record)
    setAccounts((prev) => [...prev, record])
    setActiveAccountId(record.id)
    setNotice(`Created store “${name}”.`)
    return record.id
  }, [])

  const selectAccount = useCallback((id: string) => {
    setActiveAccountId(id)
  }, [])

  const deleteAccount = useCallback(
    async (id: string) => {
      await db.deleteAccount(id)
      setAccounts((prev) => {
        const next = prev.filter((a) => a.id !== id)
        setActiveAccountId((cur) => (cur === id ? next[0]?.id ?? null : cur))
        return next
      })
    },
    [],
  )

  const ingestOrderSheet = useCallback(
    async (file: File) => {
      if (!activeAccountId) throw new Error('Select or create a store first.')
      setBusy(true)
      try {
        const result = await parseExcelFile(file)
        await db.saveItems(activeAccountId, result.items)
        const rows = await db.getItemsForAccount(activeAccountId)
        setItems(rows)
        // touch updatedAt
        const acc = accounts.find((a) => a.id === activeAccountId)
        if (acc) {
          const updated = { ...acc, updatedAt: Date.now() }
          await db.putAccount(updated)
          setAccounts((prev) => prev.map((a) => (a.id === acc.id ? updated : a)))
        }
        const canceledNote =
          result.skippedCanceled > 0 ? ` · skipped ${result.skippedCanceled} canceled` : ''
        setNotice(
          `Imported ${result.items.length} order items from “${file.name}” (sheet “${result.sheetName}”)${canceledNote}.`,
        )
      } finally {
        setBusy(false)
      }
    },
    [activeAccountId, accounts],
  )

  const previewInvoices = useCallback(
    async (files: File[]): Promise<InvoicePreview> => {
      setBusy(true)
      setBulkProgress({ done: 0, total: files.length, fileName: files[0]?.name ?? '' })
      try {
        // MASTER BLUEPRINT: the Temu sheet is the source of truth. Build one entry
        // per unique `contribution sku` (numeric Temu IDs excluded), carrying a
        // representative product name and how many sales items it reconciles.
        const masterMap = new Map<string, { sku: string; productName: string; matchCount: number }>()
        for (const it of items) {
          const key = normSku(it.sku)
          if (!key || !/[A-Z]/.test(key)) continue
          const cur = masterMap.get(key)
          if (cur) cur.matchCount += 1
          else masterMap.set(key, { sku: it.sku.trim(), productName: it.productName || '', matchCount: 1 })
        }
        const validTemuSkus = new Set(masterMap.keys())

        const bulk = await extractInvoiceFiles(
          files,
          (done, total, fileName) => setBulkProgress({ done, total, fileName }),
          validTemuSkus.size > 0 ? validTemuSkus : undefined,
        )

        // Index whatever costs the invoices yielded, keyed by normalized SKU.
        const foundCost = new Map<string, ExtractedCost>()
        for (const c of bulk.costs) foundCost.set(normSku(c.sku), c)

        let rows: ReviewRow[]
        if (masterMap.size > 0) {
          // SHEET-DRIVEN: emit a row for EVERY master SKU so all of them are always
          // visible. Hydrate the cost from the invoices when found; otherwise leave
          // it at 0 for the user to type in manually (the row stays put either way).
          rows = [...masterMap.values()].map((m, i) => {
            const key = normSku(m.sku)
            const hit = foundCost.get(key)
            const unitCost = hit && hit.unitCost > 0 ? hit.unitCost : 0
            return {
              sku: m.sku,
              productName: hit?.productName || m.productName || '',
              currency: hit?.currency,
              source: hit?.source ?? 'sheet',
              method: hit?.method,
              unitCost,
              rowId: `${key}-${i}`,
              targetListingPrice: round2(unitCost * DEFAULT_MARKUP),
              matchCount: m.matchCount,
              // Auto-select only rows we could price; price-less rows stay visible
              // and editable, and select themselves once a cost is typed.
              selected: unitCost > 0,
            }
          })
        } else {
          // Fallback (no Temu sheet loaded yet): drive from the invoice findings.
          rows = bulk.costs.map((c, i) => ({
            ...c,
            rowId: `${normSku(c.sku)}-${i}`,
            productName: c.productName ?? '',
            targetListingPrice: round2(c.unitCost * DEFAULT_MARKUP),
            matchCount: 0,
            selected: c.unitCost > 0,
          }))
        }
        // Priced rows first, then alphabetical for a stable order.
        rows.sort(
          (a, b) => Number(b.unitCost > 0) - Number(a.unitCost > 0) || a.sku.localeCompare(b.sku),
        )

        const hydrated = rows.filter((r) => r.unitCost > 0).length
        return { rows, perFile: bulk.perFile, totalFiles: bulk.totalFiles, okFiles: bulk.okFiles, hydrated }
      } finally {
        setBusy(false)
        setBulkProgress(null)
      }
    },
    [items],
  )

  const commitProducts = useCallback(
    async (rows: ReviewRow[]) => {
      const chosen = rows.filter((r) => r.selected && Number.isFinite(r.unitCost) && r.unitCost > 0)
      if (chosen.length === 0) {
        setNotice('No products selected — nothing committed.')
        return { matched: 0, committed: 0 }
      }
      const now = Date.now()
      // Write the rich product catalog...
      const productRecords: ProductRecord[] = chosen.map((c) => ({
        skuKey: skuKey(c.sku),
        sku: c.sku.trim(),
        productName: (c.productName || c.sku).trim(),
        costPrice: c.unitCost,
        targetListingPrice: Number.isFinite(c.targetListingPrice)
          ? c.targetListingPrice
          : round2(c.unitCost * DEFAULT_MARKUP),
        currency: c.currency,
        source: c.source ?? 'invoice',
        updatedAt: now,
      }))
      // ...and mirror cost into the reconciliation ledger so sales profit updates.
      const costEntries: CostEntry[] = chosen.map((c) => ({
        skuKey: skuKey(c.sku),
        sku: c.sku.trim(),
        unitCost: c.unitCost,
        currency: c.currency,
        source: c.source ?? 'invoice',
        updatedAt: now,
      }))
      await Promise.all([db.saveProducts(productRecords), db.saveCostEntries(costEntries)])
      const [freshCosts, freshProducts] = await Promise.all([db.getCostRegistry(), db.getProducts()])
      setCostRegistry(freshCosts)
      setProducts(freshProducts)

      // Reconcile count uses the same cross-reference rules as the dashboard.
      // Reconcile count — STRICT SKU match only (no product-name fallback).
      const keys = new Set(chosen.map((c) => normSku(c.sku)).filter(Boolean))
      const matched = items.filter((it) => keys.has(normSku(it.sku))).length

      setNotice(
        `Saved ${productRecords.length} product${productRecords.length === 1 ? '' : 's'} · ${matched} sales item(s) reconciled.`,
      )
      return { matched, committed: productRecords.length }
    },
    [items],
  )

  const clearNotice = useCallback(() => setNotice(null), [])

  // Reconcile costs onto items (memoized; recomputes when items or costs change).
  const dataset = useMemo<ActiveDataset | null>(() => {
    if (!activeAccountId) return null
    const costMap = buildCostMap(costRegistry)
    const costed = applyCosts(items, costMap)
    return {
      items: costed,
      kpis: computeCostedKpis(costed),
      currency: inferCurrency(items),
    }
  }, [activeAccountId, items, costRegistry])

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  )

  const value: StoreValue = {
    ready,
    accounts,
    activeAccountId,
    activeAccount,
    costRegistry,
    products,
    dataset,
    busy,
    bulkProgress,
    notice,
    createAccount,
    selectAccount,
    deleteAccount,
    ingestOrderSheet,
    previewInvoices,
    commitProducts,
    clearNotice,
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
