'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { PageShell } from '@/components/page-shell'
import { RequireAuth } from '@/components/require-auth'
import { api } from '@/lib/api'
import type { InterviewSummary } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  created: 'Not started',
  ready: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  abandoned: 'Ended',
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <HistoryContent />
    </RequireAuth>
  )
}

function HistoryContent() {
  const [items, setItems] = useState<InterviewSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<InterviewSummary[]>('/interviews')
      .then(setItems)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <PageShell>
      <section className="py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Your archive</p>
            <h1 className="mt-3 text-4xl font-medium tracking-tight">Interview history</h1>
            <p className="mt-3 text-muted-foreground">Review the pattern across your practice, not just one score.</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-8 text-sm text-red-500">
            {error}
          </p>
        )}
        {!items && !error && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
        {items && items.length === 0 && (
          <p className="mt-8 text-sm text-muted-foreground">No interviews yet. Start one from the dashboard.</p>
        )}

        {items && items.length > 0 && (
          <div className="mt-10 overflow-x-auto border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-normal">Date</th>
                  <th className="px-5 py-4 font-normal">Role</th>
                  <th className="px-5 py-4 font-normal">Difficulty</th>
                  <th className="px-5 py-4 font-normal">Status</th>
                  <th className="px-5 py-4 font-normal">Score</th>
                  <th className="px-5 py-4 font-normal">View</th>
                </tr>
              </thead>
              <tbody>
                {items.map((session) => {
                  const done = session.status === 'completed' && session.overall_score !== null
                  const ended = session.status === 'abandoned'
                  return (
                    <tr key={session.interview_id} className="border-t border-border">
                      <td className="px-5 py-5 font-mono text-xs">
                        {new Date(session.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </td>
                      <td className="px-5 py-5">{session.role}</td>
                      <td className="px-5 py-5 text-muted-foreground">{session.difficulty}</td>
                      <td className="px-5 py-5 text-muted-foreground">{STATUS_LABEL[session.status]}</td>
                      <td className="px-5 py-5">
                        {done ? (
                          <span
                            className={`inline-flex px-2.5 py-1 font-mono text-xs ${
                              (session.overall_score ?? 0) >= 80 ? 'bg-primary/10 text-primary' : 'bg-coral/10 text-coral'
                            }`}
                          >
                            {Math.round(session.overall_score ?? 0)} / 100
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-5">
                        {ended ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Link
                            href={done ? `/report/${session.interview_id}` : `/interview/${session.interview_id}`}
                            className="text-primary hover:underline"
                          >
                            {done ? 'Open report' : session.status === 'in_progress' ? 'Resume' : 'Open'}
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  )
}
