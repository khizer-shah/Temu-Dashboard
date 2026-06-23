import { useMemo, useState } from 'react'
import { X, Check, FileText, AlertTriangle, Link2, CircleSlash } from 'lucide-react'
import type { InvoicePreview, ReviewRow } from '../store/StoreContext'
import { useStore } from '../store/StoreContext'

interface Props {
  preview: InvoicePreview
  onClose: () => void
}

const METHOD_LABEL: Record<string, { label: string; cls: string }> = {
  labelled: { label: 'SKU label', cls: 'text-accent border-accent/30 bg-accent/10' },
  inline: { label: 'inline', cls: 'text-sky-300 border-sky-400/30 bg-sky-400/10' },
  loose: { label: 'loose code', cls: 'text-amber-300 border-amber-400/30 bg-amber-400/10' },
}

export function InvoiceReviewModal({ preview, onClose }: Props) {
  const { commitCostRows } = useStore()
  const [rows, setRows] = useState<ReviewRow[]>(preview.rows)
  const [committing, setCommitting] = useState(false)
  const [onlyMatched, setOnlyMatched] = useState(false)

  const visible = useMemo(
    () => (onlyMatched ? rows.filter((r) => r.matchCount > 0) : rows),
    [rows, onlyMatched],
  )

  const selectedCount = rows.filter((r) => r.selected).length
  const matchedSelected = rows.filter((r) => r.selected && r.matchCount > 0).length

  const update = (rowId: string, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))

  const toggleAll = (selected: boolean) =>
    setRows((prev) => prev.map((r) => (visible.some((v) => v.rowId === r.rowId) ? { ...r, selected } : r)))

  const commit = async () => {
    setCommitting(true)
    try {
      await commitCostRows(rows)
      onClose()
    } finally {
      setCommitting(false)
    }
  }

  const failedFiles = preview.perFile.filter((f) => f.error)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-850 shadow-glow animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/5 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <FileText className="h-4 w-4 text-accent" />
              Review extracted costs
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {preview.okFiles}/{preview.totalFiles} file(s) parsed · {rows.length} unique SKU cost
              {rows.length === 1 ? '' : 's'} found · {matchedSelected} will reconcile items in this store
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Per-file diagnostics */}
        <div className="flex flex-wrap gap-2 border-b border-white/5 px-5 py-3">
          {preview.perFile.map((f) => (
            <span
              key={f.fileName}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs',
                f.error
                  ? 'border-red-400/30 bg-red-400/10 text-red-300'
                  : 'border-white/10 bg-surface-800 text-slate-400',
              ].join(' ')}
              title={f.error ?? `${f.count} costs${f.pages ? ` · ${f.pages} pages` : ''}`}
            >
              {f.error ? <AlertTriangle className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="max-w-[160px] truncate">{f.fileName}</span>
              <span className="text-slate-600">·</span>
              {f.error ? 'failed' : `${f.count}${f.pages ? ` / ${f.pages}p` : ''}`}
            </span>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-5 py-2.5 text-xs">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => toggleAll(true)} className="text-accent hover:underline">
              Select all
            </button>
            <button type="button" onClick={() => toggleAll(false)} className="text-slate-400 hover:underline">
              Clear
            </button>
            <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-slate-400">
              <input
                type="checkbox"
                checked={onlyMatched}
                onChange={(e) => setOnlyMatched(e.target.checked)}
                className="accent-accent"
              />
              Matched only
            </label>
          </div>
          <span className="text-slate-500">{selectedCount} selected</span>
        </div>

        {/* Rows */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-sm text-slate-500">
              <CircleSlash className="h-6 w-6 text-slate-600" />
              No cost rows {onlyMatched ? 'match items in this store' : 'were extracted'}.
              {failedFiles.length > 0 && (
                <span className="text-red-300/80">{failedFiles.length} file(s) failed to parse.</span>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-850">
                <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 font-medium" />
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 text-right font-medium">Unit Cost</th>
                  <th className="px-4 py-2 font-medium">Match</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.rowId}
                    className={[
                      'border-b border-white/[0.03] transition-colors',
                      r.selected ? 'bg-accent/[0.04]' : 'hover:bg-white/[0.02]',
                    ].join(' ')}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => update(r.rowId, { selected: e.target.checked })}
                        className="accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={r.sku}
                        onChange={(e) => update(r.rowId, { sku: e.target.value })}
                        className="w-36 rounded-md border border-white/10 bg-surface-900 px-2 py-1 font-mono text-xs text-white focus:border-accent/50 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={r.unitCost}
                        onChange={(e) => update(r.rowId, { unitCost: parseFloat(e.target.value) })}
                        className="w-24 rounded-md border border-white/10 bg-surface-900 px-2 py-1 text-right tabular-nums text-white focus:border-accent/50 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      {r.matchCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-accent">
                          <Link2 className="h-3 w-3" />
                          {r.matchCount} item{r.matchCount === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">no match</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.method && (
                        <span
                          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${
                            METHOD_LABEL[r.method]?.cls ?? 'border-white/10 text-slate-400'
                          }`}
                          title={r.source}
                        >
                          {METHOD_LABEL[r.method]?.label ?? r.method}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/5 p-4">
          <p className="text-xs text-slate-500">
            Costs are stored globally and reconciled against every store's matching SKUs.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={committing || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              Commit {selectedCount} cost{selectedCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
