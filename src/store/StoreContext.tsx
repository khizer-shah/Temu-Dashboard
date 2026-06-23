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
import type { AccountRecord, CostEntry, StoredOrderItem } from '../lib/db'
import { parseExcelFile } from '../lib/parseExcel'
import { extractInvoiceFiles, type BulkInvoiceResult, type ExtractedCost } from '../lib/invoiceExtract'
import { applyCosts, buildCostMap, computeCostedKpis, skuKey, type CostedItem, type CostedKpis } from '../lib/costModel'

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

/** A reviewable extracted cost row, augmented with how many active items match. */
export interface ReviewRow extends ExtractedCost {
  /** Stable row id for the review UI. */
  rowId: string
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
   * Extract costs from one or more invoice files WITHOUT committing them.
   * Returns a preview for the review modal (rows + per-file diagnostics).
   */
  previewInvoices: (files: File[]) => Promise<InvoicePreview>
  /** Persist the chosen reviewed cost rows into the global registry + reconcile. */
  commitCostRows: (rows: ReviewRow[]) => Promise<{ matched: number; committed: number }>
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
  const [items, setItems] = useState<StoredOrderItem[]>([])
  const [busy, setBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Initial hydrate from IndexedDB.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [accs, costs] = await Promise.all([db.getAccounts(), db.getCostRegistry()])
      if (cancelled) return
      setAccounts(accs)
      setCostRegistry(costs)
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
        setNotice(
          `Imported ${result.items.length} order items from “${file.name}” (sheet “${result.sheetName}”).`,
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
        const bulk = await extractInvoiceFiles(files, (done, total, fileName) =>
          setBulkProgress({ done, total, fileName }),
        )

        // Count, per extracted SKU, how many active-account items it reconciles.
        const itemKeys = items.map((it) => skuKey(it.sku))
        const rows: ReviewRow[] = bulk.costs.map((c, i) => {
          const key = skuKey(c.sku)
          const matchCount = itemKeys.filter((k) => k === key).length
          return {
            ...c,
            rowId: `${key}-${i}`,
            matchCount,
            // Pre-select rows that actually match something in this store.
            selected: matchCount > 0,
          }
        })
        // Show matched rows first, then by extraction confidence.
        rows.sort((a, b) => b.matchCount - a.matchCount)

        return { rows, perFile: bulk.perFile, totalFiles: bulk.totalFiles, okFiles: bulk.okFiles }
      } finally {
        setBusy(false)
        setBulkProgress(null)
      }
    },
    [items],
  )

  const commitCostRows = useCallback(
    async (rows: ReviewRow[]) => {
      const chosen = rows.filter((r) => r.selected && Number.isFinite(r.unitCost) && r.unitCost > 0)
      if (chosen.length === 0) {
        setNotice('No cost rows selected — nothing committed.')
        return { matched: 0, committed: 0 }
      }
      const now = Date.now()
      const entries: CostEntry[] = chosen.map((c) => ({
        skuKey: skuKey(c.sku),
        sku: c.sku,
        unitCost: c.unitCost,
        currency: c.currency,
        source: c.source ?? 'invoice',
        updatedAt: now,
      }))
      await db.saveCostEntries(entries)
      const fresh = await db.getCostRegistry()
      setCostRegistry(fresh)

      const keys = new Set(entries.map((e) => e.skuKey))
      const matched = items.filter((it) => keys.has(skuKey(it.sku))).length
      setNotice(`Committed ${entries.length} cost${entries.length === 1 ? '' : 's'} · ${matched} item(s) reconciled.`)
      return { matched, committed: entries.length }
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
    dataset,
    busy,
    bulkProgress,
    notice,
    createAccount,
    selectAccount,
    deleteAccount,
    ingestOrderSheet,
    previewInvoices,
    commitCostRows,
    clearNotice,
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
