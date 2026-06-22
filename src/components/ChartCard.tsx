import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface ChartCardProps {
  title: string
  subtitle: string
  icon: LucideIcon
  children: ReactNode
  className?: string
}

export function ChartCard({ title, subtitle, icon: Icon, children, className = '' }: ChartCardProps) {
  return (
    <div className={`card flex flex-col p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/20 bg-accent/5 text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-medium text-white">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
