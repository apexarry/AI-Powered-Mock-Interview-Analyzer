import { Waves } from 'lucide-react'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ''}`}>
      <span className="grid size-7 place-items-center bg-primary text-primary-foreground">
        <Waves className="size-4" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold tracking-tight">signal</span>
    </span>
  )
}
