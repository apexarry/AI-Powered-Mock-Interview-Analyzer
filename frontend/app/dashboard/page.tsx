'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, Clock3, FileText, Mic2, Plus, Target, TrendingUp } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { RequireAuth } from '@/components/require-auth'
import { SiteHeader } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Interview, InterviewSummary } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  created: 'Not started',
  ready: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  abandoned: 'Ended',
}

function formatDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function DashboardContent() {
  const { user } = useAuth()
  const [items, setItems] = useState<InterviewSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [endingId, setEndingId] = useState<number | null>(null)

  useEffect(() => {
    api<InterviewSummary[]>('/interviews')
      .then(setItems)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function endSession(id: number) {
    if (!window.confirm('End this session? You will not be able to resume it.')) return
    setEndingId(id)
    setError(null)
    try {
      const updated = await api<Interview>(`/interviews/${id}/abandon`, { method: 'POST' })
      setItems((prev) =>
        prev
          ? prev.map((s) =>
              s.interview_id === id ? { ...s, status: updated.status, end_time: updated.end_time } : s,
            )
          : prev,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end the session.')
    } finally {
      setEndingId(null)
    }
  }

  const all = items ?? []
  const scored = all.filter((i) => i.overall_score !== null)
  const inProgress = all.filter((i) => i.status === 'in_progress').length
  const average = scored.length
    ? Math.round(scored.reduce((sum, i) => sum + (i.overall_score ?? 0), 0) / scored.length)
    : null
  const latest = scored[0] ?? null
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 lg:px-10 lg:py-14">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Your practice room</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Welcome back, {firstName}.</h1>
            <p className="mt-3 text-muted-foreground">One focused session today can make the real one feel familiar.</p>
          </div>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/setup">
              <Plus data-icon="inline-start" /> New interview
            </Link>
          </Button>
        </div>

        <section className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-3">
          <div className="bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sessions completed</span>
              <Mic2 className="size-4 text-primary" />
            </div>
            <p className="mt-4 font-mono text-3xl">{String(scored.length).padStart(2, '0')}</p>
            <p className="mt-2 text-xs text-primary">{inProgress} in progress</p>
          </div>
          <div className="bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Average score</span>
              <BarChart3 className="size-4 text-primary" />
            </div>
            <p className="mt-4 font-mono text-3xl">
              {average ?? '—'}
              {average !== null && <span className="text-base text-muted-foreground"> / 100</span>}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Across completed sessions</p>
          </div>
          <div className="bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Latest score</span>
              <TrendingUp className="size-4 text-primary" />
            </div>
            <p className="mt-4 font-mono text-3xl">
              {latest?.overall_score !== null && latest?.overall_score !== undefined
                ? Math.round(latest.overall_score)
                : '—'}
              {latest?.overall_score !== null && latest?.overall_score !== undefined && (
                <span className="text-base text-muted-foreground"> / 100</span>
              )}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{latest ? latest.role : 'No sessions yet'}</p>
          </div>
        </section>

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-500">
            {error}
          </p>
        )}

        <section className="mt-12 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-medium">Recent sessions</h2>
              <Link href="/history" className="flex items-center gap-2 text-xs font-medium text-primary">
                View history <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="mt-5 border border-border bg-card">
              {!items && !error && (
                <p className="p-5 text-sm text-muted-foreground">Loading…</p>
              )}
              {items && items.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-sm font-medium">No interviews yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Start one to get your first scored report.</p>
                  <Button asChild className="mt-5">
                    <Link href="/setup">Start an interview</Link>
                  </Button>
                </div>
              )}
              {all.slice(0, 3).map((session) => {
                const done = session.status === 'completed'
                const ended = session.status === 'abandoned'
                const active = !done && !ended
                const href = done ? `/report/${session.interview_id}` : `/interview/${session.interview_id}`
                const main = (
                  <>
                    <div className="flex items-center gap-4">
                      <span className="grid size-10 place-items-center bg-primary/10 text-primary">
                        <FileText className="size-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{session.role}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {session.difficulty} · {formatDate(session.created_at)} · {STATUS_LABEL[session.status]}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 pl-14 sm:pl-0">
                      {done && session.overall_score !== null ? (
                        <span className="font-mono text-sm text-primary">{Math.round(session.overall_score)}/100</span>
                      ) : ended ? null : (
                        <span className="text-sm font-medium text-primary">
                          {session.status === 'in_progress' ? 'Resume' : 'Open'}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 className="size-3.5" />
                        {done ? 'Complete' : ended ? 'Ended' : 'Pending'}
                      </span>
                    </div>
                  </>
                )
                return (
                  <div
                    key={session.interview_id}
                    className="flex flex-col gap-4 border-b border-border p-5 last:border-b-0 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {ended ? (
                      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        {main}
                      </div>
                    ) : (
                      <Link
                        href={href}
                        className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        {main}
                      </Link>
                    )}
                    {active && (
                      <div className="pl-14 sm:pl-0 sm:ml-6">
                        <button
                          type="button"
                          onClick={() => endSession(session.interview_id)}
                          disabled={endingId === session.interview_id}
                          className="inline-flex items-center border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-coral hover:text-coral disabled:opacity-60"
                        >
                          {endingId === session.interview_id ? 'Ending…' : 'End session'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              <h2 className="text-sm font-medium">Your next focus</h2>
            </div>
            <p className="mt-6 text-2xl font-medium tracking-tight">Structure your stories.</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Strong answers follow a situation, action, result rhythm. Practice one behavioral question and read the
              structure score in your report.
            </p>
            <div className="mt-7 h-2 bg-muted">
              <div className="h-2 w-[68%] bg-primary" />
            </div>
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span className="font-mono">68%</span>
            </div>
            <Button asChild variant="outline" className="mt-7 w-full">
              <Link href="/setup">
                Practice this skill <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  )
}
