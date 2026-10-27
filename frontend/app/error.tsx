'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10 text-foreground">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center bg-coral/10 text-coral">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-6 text-2xl font-medium tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          An unexpected error interrupted this page. Try again, or head back to your dashboard.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
