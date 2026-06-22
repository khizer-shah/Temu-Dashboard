import { useMemo, useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Search,
} from 'lucide-react'
import type { OrderItem } from '../lib/types'
import { downloadCsv } from '../lib/exportCsv'
import { formatMoney, formatNumber, formatCurrencyCompact } from '../lib/format'

type SortKey =
  | 'orderId'
  | 'productName'
  | 'sku'
  | 'status'
  | 'qtyPurchased'
  | 'revenue'
  | 'carrier'
  | 'country'
  | 'dateSort'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 10

interface Column {
  key: SortKey
  label: string
  align: 'left' | 'right'
  render: (o: OrderItem, currency: string) => React.ReactNode
}

const STATUS_STYLES: Record<string, string> = {
  delivered: 'border-accent/30 bg-accent/10 text-accent',
  shipped: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  canceled: 'border-red-400/30 bg-red-400/10 text-red-300',
  cancelled: 'border-red-400/30 bg-red-400/10 text-red-300',
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  processing: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
}

function statusBadge(status: string) {
  const cls = STATUS_STYLES[status.toLowerCase()] ?? 'border-white/10 bg-surface-700 text-slate-300'
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status}
    </span>
  )
}

const columns: Column[] = [
  {
    key: 'orderId',
    label: 'Order',
    align: 'left',
    render: (o) => <span className="font-mono text-xs text-slate-400">{o.orderId}</span>,
  },
  {
    key: 'productName',
    label: 'Product',
    align: 'left',
    render: (o) => (
      <div className="max-w-[260px]">
        <div className="truncate font-medium text-white" title={o.productName}>
          {o.productName}
        </div>
        {o.variation && <div className="truncate text-xs text-slate-500">{o.variation}</div>}
      </div>
    ),
  },
  {
    key: 'sku',
    label: 'SKU',
    align: 'left',
    render: (o) => (
      <span className="rounded-md border border-white/5 bg-surface-700 px-2 py-0.5 font-mono text-xs text-slate-300">
        {o.sku}
      </span>
    ),
  },
  { key: 'status', label: 'Status', align: 'left', render: (o) => statusBadge(o.status) },
  {
    key: 'qtyPurchased',
    label: 'Qty',
    align: 'right',
    render: (o) => <span className="tabular-nums text-slate-200">{formatNumber(o.qtyPurchased)}</span>,
  },
  {
    key: 'revenue',
    label: 'Revenue',
    align: 'right',
    render: (o, currency) => (
      <span className="tabular-nums text-white">{formatMoney(o.revenue, currency)}</span>
    ),
  },
  {
    key: 'carrier',
    label: 'Carrier',
    align: 'left',
    render: (o) => <span className="text-slate-300">{o.carrier}</span>,
  },
  {
    key: 'country',
    label: 'Destination',
    align: 'left',
    render: (o) => (
      <span className="text-slate-400">{[o.city, o.country].filter(Boolean).join(', ') || '—'}</span>
    ),
  },
  {
    key: 'dateSort',
    label: 'Purchased',
    align: 'right',
    render: (o) => <span className="text-xs text-slate-400">{o.purchaseDate?.label ?? '—'}</span>,
  },
]

function sortValue(o: OrderItem, key: SortKey): string | number {
  if (key === 'dateSort') return o.purchaseDate?.sort ?? 0
  return o[key as Exclude<SortKey, 'dateSort'>]
}

export function OrdersTable({ items, currency }: { items: OrderItem[]; currency: string }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (o) =>
        o.productName.toLowerCase().includes(q) ||
        o.sku.toLowerCase().includes(q) ||
        o.orderId.toLowerCase().includes(q) ||
        o.status.toLowerCase().includes(q) ||
        o.country.toLowerCase().includes(q),
    )
  }, [items, query])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      const textCols: SortKey[] = ['orderId', 'productName', 'sku', 'status', 'carrier', 'country']
      setSortDir(textCols.includes(key) ? 'asc' : 'desc')
    }
    setPage(0)
  }

  const rangeStart = sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const rangeEnd = Math.min(sorted.length, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">Order Line Items</h3>
          <p className="text-xs text-slate-500">
            {formatNumber(sorted.length)} of {formatNumber(items.length)} items ·{' '}
            {formatCurrencyCompact(
              sorted.reduce((s, o) => s + o.revenue, 0),
              currency,
            )}{' '}
            shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              placeholder="Search order, product, SKU, status…"
              className="w-full rounded-lg border border-white/10 bg-surface-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 sm:w-72"
            />
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(sorted)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {columns.map((col) => {
                const active = col.key === sortKey
                return (
                  <th
                    key={col.key}
                    className={[
                      'select-none px-4 py-3 text-xs font-medium uppercase tracking-wider',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={[
                        'inline-flex items-center gap-1 transition-colors',
                        col.align === 'right' ? 'flex-row-reverse' : '',
                        active ? 'text-accent' : 'text-slate-500 hover:text-slate-300',
                      ].join(' ')}
                    >
                      {col.label}
                      {active ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((o) => (
              <tr key={o.id} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={['px-4 py-3', col.align === 'right' ? 'text-right' : 'text-left'].join(' ')}
                  >
                    {col.render(o, currency)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
                  No order items match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
        <p className="text-xs text-slate-500">
          {rangeStart}–{rangeEnd} of {formatNumber(sorted.length)}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs tabular-nums text-slate-400">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
