'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Check, FileText, Gauge, Sparkles } from 'lucide-react'

import { PageShell } from '@/components/page-shell'
import { RequireAuth } from '@/components/require-auth'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Report } from '@/lib/types'

const STAGES = [
  { label: 'Transcribing your answers', detail: 'Turning speech into a readable transcript', icon: FileText },
  { label: 'Evaluating answer quality', detail: 'Looking at relevance, structure, and clarity', icon: Gauge },
  { label: 'Generating your report', detail: 'Organizing scores and focused next steps', icon: Sparkles },
]

export default function ProcessingPage() {
  return (
    <RequireAuth>
      <ProcessingContent />
    </RequireAuth>
  )
}

function ProcessingContent() {
  const params = useParams<{ id: string }>()
  const interviewId = Number(params.id)
  const router = useRouter()
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const timers = [
      window.setTimeout(() => setStage(1), 1200),
      window.setTimeout(() => setStage(2), 2400),
    ]

    api<Report>(`/interviews/${interviewId}/complete`, { method: 'POST' })
      .then(() => {
        timers.forEach((t) => window.clearTimeout(t))
        setStage(3)
        router.replace(`/report/${interviewId}`)
      })
      .catch((e: Error) => {
        timers.forEach((t) => window.clearTimeout(t))
        setError(e.message)
      })

    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [interviewId, router])

  return (
    <PageShell back="Dashboard">
      <section className="mx-auto max-w-2xl py-20">
        <div className="border border-border bg-card p-8 sm:p-12">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Analysis in progress</p>
          <h1 className="mt-4 text-4xl font-medium tracking-tight">Reading your signal</h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Your session is being shaped into a report with scores you can act on.
          </p>

          <div className="mt-10 flex flex-col gap-6">
            {STAGES.map(({ label, detail, icon: Icon }, index) => {
              const done = index < stage
              return (
                <div key={label} className="flex gap-4">
                  <div
                    className={`grid size-10 shrink-0 place-items-center ${
                      done ? 'bg-primary/10 text-primary' : 'border border-border text-muted-foreground'
                    }`}
                  >
                    {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {error ? (
            <div className="mt-10">
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href={`/interview/${interviewId}`}>Back to the interview</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-10 h-1 bg-muted">
                <div
                  className="h-1 bg-primary transition-[width] duration-500"
                  style={{ width: `${Math.max(15, (stage / STAGES.length) * 100)}%` }}
                />
              </div>
              <p className="mt-3 font-mono text-xs text-muted-foreground">Scoring and storing your report…</p>
            </>
          )}
        </div>
      </section>
    </PageShell>
  )
}
