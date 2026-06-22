import { Boxes, RefreshCw, FileSpreadsheet } from 'lucide-react'
import type { ParseResult } from '../lib/types'
import { formatNumber } from '../lib/format'

interface DashboardHeaderProps {
  data: ParseResult
  onReset: () => void
}

export function DashboardHeader({ data, onReset }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/5 text-accent">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white sm:text-base">
              Temu Product Analysis
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <FileSpreadsheet className="h-3 w-3" />
              <span className="max-w-[180px] truncate">{data.fileName}</span>
              <span className="text-slate-700">·</span>
              <span>{formatNumber(data.kpis.orderCount)} orders</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-accent/40 hover:text-accent"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">New upload</span>
        </button>
      </div>
    </header>
  )
}
