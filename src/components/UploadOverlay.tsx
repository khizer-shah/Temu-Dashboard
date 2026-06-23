import { useState } from 'react'
import { FileSpreadsheet, UploadCloud, AlertTriangle } from 'lucide-react'
import { FileDropzone } from './FileDropzone'
import { useStore } from '../store/StoreContext'

/**
 * Order-sheet uploader shown when the active account has no data yet.
 * Persists rows under the active account via the store.
 */
export function UploadOverlay() {
  const { ingestOrderSheet, activeAccount, busy } = useStore()
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setError(null)
    try {
      await ingestOrderSheet(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process the file.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-accent" />
          {activeAccount ? activeAccount.sellerName : 'No store'}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Import your Temu order report
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Drop the exported <span className="text-slate-300">.xlsx</span> / <span className="text-slate-300">.xls</span>{' '}
          order sheet. Rows are saved under this store and persist across reloads.
        </p>
      </div>

      <FileDropzone
        accept=".xlsx,.xls"
        extensions={['.xlsx', '.xls']}
        onFile={onFile}
        busy={busy}
        className="px-8 py-14"
      >
        {({ dragging, busy: isBusy }) => (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <span
              className={[
                'flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors',
                dragging
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-white/10 bg-surface-700 text-slate-400 group-hover:text-accent',
              ].join(' ')}
            >
              {isBusy ? <UploadCloud className="h-7 w-7 animate-pulse" /> : <FileSpreadsheet className="h-7 w-7" />}
            </span>
            <div>
              <p className="text-base font-medium text-white">
                {isBusy ? 'Processing spreadsheet…' : dragging ? 'Release to upload' : 'Drag & drop your Temu export'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                or <span className="text-accent">browse</span> — handles the banner rows &amp; multi-sheet layout
              </p>
            </div>
          </div>
        )}
      </FileDropzone>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
