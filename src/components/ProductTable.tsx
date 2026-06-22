import { useMemo, useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Search,
  AlertTriangle,
} from 'lucide-react'
import type { Product } from '../lib/types'
import { downloadCsv } from '../lib/exportCsv'
import { formatMoney, formatNumber, formatPercent, formatCurrencyCompact } from '../lib/format'

type SortKey =
  | 'sku'
  | 'name'
  | 'category'
  | 'price'
  | 'cost'
  | 'unitsSold'
  | 'stock'
  | 'revenue'
  | 'profit'
  | 'margin'
type SortDir = 'asc' | 'desc'

interface Column {
  key: SortKey
  label: string
  align: 'left' | 'right'
  render: (p: Product) => React.ReactNode
}

const PAGE_SIZE = 10

const columns: Column[] = [
  { key: 'sku', label: 'SKU', align: 'left', render: (p) => <span className="font-mono text-xs text-slate-400">{p.sku}</span> },
  {
    key: 'name',
    label: 'Product',
    align: 'left',
    render: (p) => (
      <div className="flex items-center gap-2">
        <span className="max-w-[220px] truncate font-medium text-white">{p.name}</span>
        {p.lowStock && (
          <span title="Low stock" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            <AlertTriangle className="h-2.5 w-2.5" /> Low
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'category',
    label: 'Category',
    align: 'left',
    render: (p) => (
      <span className="rounded-md border border-white/5 bg-surface-700 px-2 py-0.5 text-xs text-slate-300">
        {p.category}
      </span>
    ),
  },
  { key: 'price', label: 'Price', align: 'right', render: (p) => <span className="tabular-nums text-slate-200">{formatMoney(p.price)}</span> },
  { key: 'unitsSold', label: 'Units Sold', align: 'right', render: (p) => <span className="tabular-nums text-slate-200">{formatNumber(p.unitsSold)}</span> },
  {
    key: 'stock',
    label: 'Stock',
    align: 'right',
    render: (p) => (
      <span className={['tabular-nums', p.lowStock ? 'text-amber-400' : 'text-slate-200'].join(' ')}>
        {formatNumber(p.stock)}
      </span>
    ),
  },
  { key: 'revenue', label: 'Revenue', align: 'right', render: (p) => <span className="tabular-nums text-white">{formatCurrencyCompact(p.revenue)}</span> },
  { key: 'profit', label: 'Profit', align: 'right', render: (p) => <span className="tabular-nums text-accent">{formatCurrencyCompact(p.profit)}</span> },
  {
    key: 'margin',
    label: 'Margin',
    align: 'right',
    render: (p) => {
      const tone = p.margin >= 0.4 ? 'text-emerald-400' : p.margin >= 0.2 ? 'text-slate-200' : 'text-red-400'
      return <span className={`tabular-nums ${tone}`}>{formatPercent(p.margin)}</span>
    },
  },
]

export function ProductTable({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    )
  }, [products, query])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv))
      }
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
      setSortDir(key === 'name' || key === 'sku' || key === 'category' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  const rangeStart = sorted.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const rangeEnd = Math.min(sorted.length, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">Product Catalog</h3>
          <p className="text-xs text-slate-500">
            {formatNumber(sorted.length)} of {formatNumber(products.length)} SKUs
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
              placeholder="Search SKU, name, category…"
              className="w-full rounded-lg border border-white/10 bg-surface-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 sm:w-64"
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
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
            {pageRows.map((p) => (
              <tr
                key={p.id}
                className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={['px-4 py-3', col.align === 'right' ? 'text-right' : 'text-left'].join(' ')}
                  >
                    {col.render(p)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-500">
                  No products match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
