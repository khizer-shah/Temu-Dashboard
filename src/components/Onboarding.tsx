import { useState } from 'react'
import { Store, ArrowRight, Sparkles } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { ThemeToggle } from './ThemeToggle'

/** First-run screen: no store profiles exist yet. */
export function Onboarding() {
  const { createAccount } = useStore()
  const [name, setName] = useState('')

  const submit = async () => {
    await createAccount(name.trim() || 'My Temu Store')
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-glow blur-[120px]"
      />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-md animate-fade-in text-center">
        <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/5 text-accent">
          <Store className="h-7 w-7" />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Create your first store</h1>
        <p className="mt-2 text-sm text-slate-500">
          Register a seller profile to start importing Temu order reports. Each store keeps its own
          persistent dataset.
        </p>

        <div className="mt-8 flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="Account / Seller name"
            className="flex-1 rounded-xl border border-white/10 bg-surface-850 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          <button
            type="button"
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Create
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-600">
          <Sparkles className="h-3 w-3" />
          Data is stored locally in your browser (IndexedDB) — nothing leaves this device.
        </p>
      </div>
    </div>
  )
}
