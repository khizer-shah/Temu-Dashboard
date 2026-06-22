import { useCallback, useRef, useState } from 'react'
import { FileSpreadsheet, UploadCloud, Sparkles, AlertTriangle } from 'lucide-react'

interface UploadOverlayProps {
  onFile: (file: File) => void
  onUseSample: () => void
  isLoading: boolean
  error: string | null
}

const ACCEPTED = ['.xlsx', '.xls']

function isAccepted(file: File): boolean {
  const lower = file.name.toLowerCase()
  return ACCEPTED.some((ext) => lower.endsWith(ext))
}

export function UploadOverlay({ onFile, onUseSample, isLoading, error }: UploadOverlayProps) {
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      if (!isAccepted(file)) {
        setLocalError('Unsupported file. Please upload a .xlsx or .xls spreadsheet.')
        return
      }
      setLocalError(null)
      onFile(file)
    },
    [onFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const shownError = error ?? localError

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black px-6">
      {/* subtle accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-glow blur-[120px]"
      />

      <div className="relative w-full max-w-xl animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-accent">
            <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-accent" />
            Excel-Driven Analytics
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Temu Product Analysis
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Drop a product export to hydrate the dashboard. Everything runs locally in
            your browser — no data leaves this device.
          </p>
        </div>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            if (!dragging) setDragging(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragging(false)
          }}
          onDrop={onDrop}
          className={[
            'group relative flex w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-8 py-14 text-center transition-all duration-300',
            dragging
              ? 'border-accent bg-accent/5 shadow-glow'
              : 'border-white/10 bg-surface-850/60 hover:border-accent/40 hover:bg-surface-800/60',
            isLoading ? 'cursor-wait opacity-70' : 'cursor-pointer',
          ].join(' ')}
        >
          <span
            className={[
              'flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors',
              dragging
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-white/10 bg-surface-700 text-slate-400 group-hover:text-accent',
            ].join(' ')}
          >
            {isLoading ? (
              <UploadCloud className="h-7 w-7 animate-pulse" />
            ) : (
              <FileSpreadsheet className="h-7 w-7" />
            )}
          </span>

          <div>
            <p className="text-base font-medium text-white">
              {isLoading
                ? 'Processing spreadsheet…'
                : dragging
                  ? 'Release to upload'
                  : 'Drag & drop your Excel file'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              or <span className="text-accent">browse</span> — supports .xlsx and .xls
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </button>

        {shownError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{shownError}</span>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            disabled={isLoading}
            onClick={onUseSample}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface-800 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Explore with sample data
          </button>
        </div>
      </div>
    </div>
  )
}
