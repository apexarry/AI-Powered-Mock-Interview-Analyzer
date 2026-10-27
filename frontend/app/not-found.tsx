import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10 text-foreground">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">404</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">This page isn&apos;t here.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The page you&apos;re looking for may have moved or never existed.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
