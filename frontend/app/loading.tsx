import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  )
}
