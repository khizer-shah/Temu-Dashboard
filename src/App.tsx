import { useEffect } from 'react'
import { Info, X } from 'lucide-react'
import { DashboardHeader } from './components/DashboardHeader'
import { Onboarding } from './components/Onboarding'
import { UploadOverlay } from './components/UploadOverlay'
import { InvoiceDropzone } from './components/InvoiceDropzone'
import { KpiRibbon } from './components/KpiRibbon'
import { ChartsGrid } from './components/ChartsGrid'
import { OrdersTable } from './components/OrdersTable'
import { useStore } from './store/StoreContext'

function Notice() {
  const { notice, clearNotice } = useStore()
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clearNotice, 6000)
    return () => clearTimeout(t)
  }, [notice, clearNotice])

  if (!notice) return null
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-accent/30 bg-surface-850/95 px-4 py-3 text-sm text-slate-200 shadow-glow backdrop-blur animate-fade-in">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span className="flex-1">{notice}</span>
      <button type="button" onClick={clearNotice} className="text-slate-500 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="flex items-center gap-3 text-slate-500">
        <span className="h-2 w-2 animate-pulse-ring rounded-full bg-accent" />
        Loading store registry…
      </div>
    </div>
  )
}

export default function App() {
  const { ready, accounts, dataset } = useStore()

  if (!ready) return <LoadingScreen />

  // No store profiles yet -> onboarding.
  if (accounts.length === 0) {
    return (
      <>
        <Onboarding />
        <Notice />
      </>
    )
  }

  const hasData = (dataset?.items.length ?? 0) > 0

  return (
    <div className="min-h-screen bg-black">
      <DashboardHeader />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Invoice ingestion is always available once a store exists. */}
        <InvoiceDropzone />

        {!hasData ? (
          <UploadOverlay />
        ) : (
          dataset && (
            <>
              {dataset.kpis.costedItems === 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-surface-850/60 px-4 py-3 text-sm text-slate-400 animate-fade-in">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    Sales data loaded. Upload a cost invoice above to reconcile SKUs and unlock net-profit
                    metrics.
                  </span>
                </div>
              )}

              <section className="animate-fade-in">
                <KpiRibbon kpis={dataset.kpis} currency={dataset.currency} />
              </section>

              <section className="animate-fade-in">
                <ChartsGrid items={dataset.items} currency={dataset.currency} />
              </section>

              <section className="animate-fade-in">
                <OrdersTable items={dataset.items} currency={dataset.currency} />
              </section>

              <footer className="pb-4 pt-2 text-center text-xs text-slate-600">
                Persisted locally in your browser · {dataset.kpis.itemCount} items ·{' '}
                {dataset.kpis.costedItems} reconciled with invoice costs
              </footer>
            </>
          )
        )}
      </main>

      <Notice />
    </div>
  )
}
