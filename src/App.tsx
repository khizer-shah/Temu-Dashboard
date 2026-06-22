import { useCallback, useState } from 'react'
import { Info } from 'lucide-react'
import { UploadOverlay } from './components/UploadOverlay'
import { DashboardHeader } from './components/DashboardHeader'
import { KpiRibbon } from './components/KpiRibbon'
import { ChartsGrid } from './components/ChartsGrid'
import { ProductTable } from './components/ProductTable'
import { parseExcelFile } from './lib/parseExcel'
import { buildSampleData } from './lib/sampleData'
import type { ParseResult } from './lib/types'

export default function App() {
  const [data, setData] = useState<ParseResult | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const result = await parseExcelFile(file)
      if (result.products.length === 0) {
        throw new Error('No usable rows were found in this spreadsheet.')
      }
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process the file.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSample = useCallback(() => {
    setError(null)
    setData(buildSampleData())
  }, [])

  const handleReset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  if (!data) {
    return (
      <UploadOverlay
        onFile={handleFile}
        onUseSample={handleSample}
        isLoading={isLoading}
        error={error}
      />
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <DashboardHeader data={data} onReset={handleReset} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {data.warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/90 animate-fade-in">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium text-amber-200">Heads up on column mapping</p>
              <ul className="mt-1 list-inside list-disc text-amber-200/70">
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <section className="animate-fade-in">
          <KpiRibbon kpis={data.kpis} />
        </section>

        <section className="animate-fade-in">
          <ChartsGrid products={data.products} />
        </section>

        <section className="animate-fade-in">
          <ProductTable products={data.products} />
        </section>

        <footer className="pb-4 pt-2 text-center text-xs text-slate-600">
          Processed entirely in your browser · {data.fileName}
        </footer>
      </main>
    </div>
  )
}
