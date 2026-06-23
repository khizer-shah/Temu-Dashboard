import { useState } from 'react'
import { Plus, Store, ChevronDown, Trash2, Check, X } from 'lucide-react'
import { useStore } from '../store/StoreContext'

export function AccountSwitcher() {
  const { accounts, activeAccount, activeAccountId, selectAccount, createAccount, deleteAccount } = useStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const submit = async () => {
    if (!name.trim()) return
    await createAccount(name)
    setName('')
    setCreating(false)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-surface-800 px-3 py-2 text-sm text-white transition-colors hover:border-accent/40"
      >
        <Store className="h-4 w-4 text-accent" />
        <span className="max-w-[160px] truncate">{activeAccount?.sellerName ?? 'No store selected'}</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-72 origin-top-right animate-fade-in rounded-xl border border-white/10 bg-surface-850 p-2 shadow-glow">
            <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
              Store profiles
            </div>

            <div className="max-h-60 overflow-y-auto">
              {accounts.length === 0 && (
                <p className="px-2 py-3 text-sm text-slate-500">No stores yet. Create one below.</p>
              )}
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className={[
                    'group flex items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors',
                    acc.id === activeAccountId ? 'bg-accent/10 text-accent' : 'text-slate-300 hover:bg-white/5',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => {
                      selectAccount(acc.id)
                      setOpen(false)
                    }}
                    className="flex flex-1 items-center gap-2 truncate text-left"
                  >
                    {acc.id === activeAccountId ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Store className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                    )}
                    <span className="truncate">{acc.sellerName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`Delete store “${acc.sellerName}” and all its orders?`)) {
                        await deleteAccount(acc.id)
                      }
                    }}
                    className="ml-2 shrink-0 rounded p-1 text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    title="Delete store"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-1 border-t border-white/5 pt-2">
              {creating ? (
                <div className="flex items-center gap-1.5 px-1">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submit()
                      if (e.key === 'Escape') setCreating(false)
                    }}
                    placeholder="Account / Seller name"
                    className="flex-1 rounded-lg border border-accent/30 bg-surface-900 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-600 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                  <button
                    type="button"
                    onClick={submit}
                    className="rounded-lg border border-accent/40 bg-accent/10 p-1.5 text-accent hover:bg-accent/20"
                    title="Create"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false)
                      setName('')
                    }}
                    className="rounded-lg border border-white/10 p-1.5 text-slate-400 hover:text-white"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-accent transition-colors hover:bg-accent/10"
                >
                  <Plus className="h-4 w-4" />
                  New store profile
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
