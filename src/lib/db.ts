// Cloud persistence layer for the multi-tenant store registry.
//
// Previously this module talked to browser IndexedDB; it now talks to the
// Vercel Serverless API (/api/*) backed by Neon Postgres, so data is a single
// shared dataset across all users instead of per-browser.
//
// The exported types and function signatures are intentionally UNCHANGED from
// the IndexedDB version, so `src/store/StoreContext.tsx` (the only caller) does
// not need to change. Prisma lives exclusively in /api — never import it here.
import type { OrderItem } from './types'

export interface AccountRecord {
  id: string
  sellerName: string
  createdAt: number
  updatedAt: number
}

/** A stored order item carries its owning accountId. */
export interface StoredOrderItem extends OrderItem {
  accountId: string
}

/** A single SKU cost entry in the global registry. */
export interface CostEntry {
  /** Normalized SKU key (lowercased, trimmed) — the primary key. */
  skuKey: string
  /** Original SKU as seen on the invoice (for display). */
  sku: string
  unitCost: number
  /** Currency code if detected on the invoice. */
  currency?: string
  source: string
  updatedAt: number
}

/**
 * A product registered from a supplier invoice: cost + name + a target retail
 * price (cost × markup). Global catalog, keyed by normalized SKU.
 */
export interface ProductRecord {
  skuKey: string
  sku: string
  productName: string
  costPrice: number
  /** costPrice × markup (default 1.20), editable before commit. */
  targetListingPrice: number
  currency?: string
  source: string
  updatedAt: number
}

/* ------------------------------ transport --------------------------- */

/** Base URL for the API. Same-origin by default; override with VITE_API_BASE. */
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

/** Thin JSON fetch helper: throws on non-2xx, returns parsed body (or undefined for 204). */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.error ?? ''
    } catch {
      /* ignore */
    }
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}${detail ? ` — ${detail}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/* ----------------------------- Accounts ----------------------------- */

export async function getAccounts(): Promise<AccountRecord[]> {
  return api<AccountRecord[]>('/accounts')
}

export async function putAccount(account: AccountRecord): Promise<void> {
  await api('/accounts', { method: 'POST', body: JSON.stringify(account) })
}

export async function deleteAccount(accountId: string): Promise<void> {
  await api(`/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' })
}

/* --------------------------- Order items ---------------------------- */

export async function getItemsForAccount(accountId: string): Promise<StoredOrderItem[]> {
  return api<StoredOrderItem[]>(`/orders?accountId=${encodeURIComponent(accountId)}`)
}

/**
 * Upsert a batch of order items for an account. Existing rows with the same id
 * are overwritten (idempotent re-uploads); other accounts are untouched.
 */
export async function saveItems(accountId: string, items: OrderItem[]): Promise<void> {
  await api('/orders', { method: 'POST', body: JSON.stringify({ accountId, items }) })
}

export async function clearItemsForAccount(accountId: string): Promise<void> {
  await api(`/orders?accountId=${encodeURIComponent(accountId)}`, { method: 'DELETE' })
}

/* --------------------------- Cost registry -------------------------- */

export async function getCostRegistry(): Promise<CostEntry[]> {
  return api<CostEntry[]>('/costs')
}

/** Upsert cost entries (later invoices overwrite earlier costs for a SKU). */
export async function saveCostEntries(entries: CostEntry[]): Promise<void> {
  await api('/costs', { method: 'POST', body: JSON.stringify({ costs: entries }) })
}

export async function clearCostRegistry(): Promise<void> {
  await api('/costs', { method: 'DELETE' })
}

/* ----------------------------- Products ----------------------------- */

export async function getProducts(): Promise<ProductRecord[]> {
  return api<ProductRecord[]>('/products')
}

/** Upsert product records (later invoices overwrite earlier data for a SKU). */
export async function saveProducts(records: ProductRecord[]): Promise<void> {
  await api('/products', { method: 'POST', body: JSON.stringify({ products: records }) })
}

export async function clearProducts(): Promise<void> {
  await api('/products', { method: 'DELETE' })
}
