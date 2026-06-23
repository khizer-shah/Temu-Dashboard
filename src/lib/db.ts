// IndexedDB persistence layer for the multi-tenant store registry.
//
// Schema (object stores):
//   accounts     — store profiles, keyed by id            { id, sellerName, createdAt, updatedAt }
//   orderItems   — order line items, keyed by id,         indexed by accountId
//   costRegistry — global SKU -> cost ledger, keyed by skuKey
//
// The `idb` wrapper gives us a typed, promise-based API over native IndexedDB so
// we get IndexedDB's capacity (well beyond localStorage's ~5MB) without the
// verbose request/transaction boilerplate.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
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

interface StoreDB extends DBSchema {
  accounts: {
    key: string
    value: AccountRecord
  }
  orderItems: {
    key: string
    value: StoredOrderItem
    indexes: { byAccount: string }
  }
  costRegistry: {
    key: string
    value: CostEntry
  }
  products: {
    key: string
    value: ProductRecord
  }
}

const DB_NAME = 'temu-store-registry'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<StoreDB>> | null = null

function getDB(): Promise<IDBPDatabase<StoreDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StoreDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('accounts')) {
          db.createObjectStore('accounts', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('orderItems')) {
          const store = db.createObjectStore('orderItems', { keyPath: 'id' })
          store.createIndex('byAccount', 'accountId')
        }
        if (!db.objectStoreNames.contains('costRegistry')) {
          db.createObjectStore('costRegistry', { keyPath: 'skuKey' })
        }
        // v2: product catalog registered from supplier invoices.
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'skuKey' })
        }
      },
    })
  }
  return dbPromise
}

/* ----------------------------- Accounts ----------------------------- */

export async function getAccounts(): Promise<AccountRecord[]> {
  const db = await getDB()
  const all = await db.getAll('accounts')
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function putAccount(account: AccountRecord): Promise<void> {
  const db = await getDB()
  await db.put('accounts', account)
}

export async function deleteAccount(accountId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['accounts', 'orderItems'], 'readwrite')
  await tx.objectStore('accounts').delete(accountId)
  // Cascade: remove this account's order items.
  const idx = tx.objectStore('orderItems').index('byAccount')
  let cursor = await idx.openCursor(accountId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

/* --------------------------- Order items ---------------------------- */

export async function getItemsForAccount(accountId: string): Promise<StoredOrderItem[]> {
  const db = await getDB()
  return db.getAllFromIndex('orderItems', 'byAccount', accountId)
}

/**
 * Upsert a batch of order items for an account. Existing rows with the same id
 * are overwritten (idempotent re-uploads); other accounts are untouched.
 */
export async function saveItems(accountId: string, items: OrderItem[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('orderItems', 'readwrite')
  const store = tx.objectStore('orderItems')
  for (const item of items) {
    await store.put({ ...item, accountId })
  }
  await tx.done
}

export async function clearItemsForAccount(accountId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('orderItems', 'readwrite')
  const idx = tx.objectStore('orderItems').index('byAccount')
  let cursor = await idx.openCursor(accountId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

/* --------------------------- Cost registry -------------------------- */

export async function getCostRegistry(): Promise<CostEntry[]> {
  const db = await getDB()
  return db.getAll('costRegistry')
}

/** Upsert cost entries (later invoices overwrite earlier costs for a SKU). */
export async function saveCostEntries(entries: CostEntry[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('costRegistry', 'readwrite')
  const store = tx.objectStore('costRegistry')
  for (const entry of entries) {
    await store.put(entry)
  }
  await tx.done
}

export async function clearCostRegistry(): Promise<void> {
  const db = await getDB()
  await db.clear('costRegistry')
}

/* ----------------------------- Products ----------------------------- */

export async function getProducts(): Promise<ProductRecord[]> {
  const db = await getDB()
  return db.getAll('products')
}

/** Upsert product records (later invoices overwrite earlier data for a SKU). */
export async function saveProducts(records: ProductRecord[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('products', 'readwrite')
  const store = tx.objectStore('products')
  for (const rec of records) {
    await store.put(rec)
  }
  await tx.done
}

export async function clearProducts(): Promise<void> {
  const db = await getDB()
  await db.clear('products')
}
