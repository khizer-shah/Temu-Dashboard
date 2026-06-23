import { useState } from 'react'
import { ReceiptText, Loader2, AlertTriangle, Layers } from 'lucide-react'
import { FileDropzone } from './FileDropzone'
import { InvoiceReviewModal } from './InvoiceReviewModal'
import { useStore, type InvoicePreview } from '../store/StoreContext'

export function InvoiceDropzone() {
  const { previewInvoices, busy, bulkProgress } = useStore()
  const [preview, setPreview] = useState<InvoicePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFiles = async (files: File[]) => {
    setError(null)
    try {
      const result = await previewInvoices(files)
      setPreview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the invoices.')
    }
  }

  return (
    <>
      <FileDropzone
        accept=".pdf,.csv,.xlsx,.xls"
        extensions={['.pdf', '.csv', '.xlsx', '.xls']}
        multiple
        onFiles={onFiles}
        busy={busy}
      >
        {({ dragging, busy: isBusy }) => (
          <div className="flex items-center gap-4 p-5">
            <span
              className={[
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors',
                dragging
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-white/10 bg-surface-700 text-slate-400 group-hover:text-accent',
              ].join(' ')}
            >
              {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ReceiptText className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                Ingest Cost Invoices (.pdf, .csv, .xlsx)
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  <Layers className="h-2.5 w-2.5" /> bulk
                </span>
              </p>
              {isBusy && bulkProgress ? (
                <p className="mt-0.5 text-xs text-accent">
                  Processing {bulkProgress.done}/{bulkProgress.total}
                  {bulkProgress.fileName ? ` · ${bulkProgress.fileName}` : ''}…
                </p>
              ) : error ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-red-300">
                  <AlertTriangle className="h-3 w-3" /> {error}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-500">
                  Drop one or many invoices (multi-page safe). You'll review extracted SKU costs before they
                  reconcile.
                </p>
              )}
            </div>
          </div>
        )}
      </FileDropzone>

      {preview && <InvoiceReviewModal preview={preview} onClose={() => setPreview(null)} />}
    </>
  )
}
