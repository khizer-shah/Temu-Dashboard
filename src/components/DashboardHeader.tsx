import { Boxes } from 'lucide-react'
import { AccountSwitcher } from './AccountSwitcher'

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/5 text-accent">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white sm:text-base">
              Temu Store Manager
            </h1>
            <p className="text-xs text-slate-500">Multi-account analytics · invoice-reconciled profit</p>
          </div>
        </div>

        <AccountSwitcher />
      </div>
    </header>
  )
}
