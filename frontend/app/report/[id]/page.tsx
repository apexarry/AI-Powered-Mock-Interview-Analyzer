'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { RequireAuth } from '@/components/require-auth'
import { EVENT_LABELS } from '@/hooks/useProctoring'
import { api } from '@/lib/api'
import type { Report } from '@/lib/types'

const INDICATOR_TEXT: Record<string, string> = {
  clean: 'No proctoring events were recorded.',
  minor: 'A few minor events were recorded.',
  moderate: 'Several events were recorded. In a real assessment these could be flagged.',
  significant: 'Many events were recorded. In a real assessment this session would likely be flagged.',
}

function ScoreBar({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-lg text-primary">{value === null ? 'n/a' : Math.round(value)}</span>
      </div>
      <div
        className="mt-2 h-2 bg-muted"
        role="img"
        aria-label={`${label}: ${value === null ? 'not available' : `${Math.round(value)} out of 100`}`}
      >
        <div className="h-2 bg-primary" style={{ width: `${value ?? 0}%` }} />
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default function ReportPage() {
  return (
    <RequireAuth>
      <ReportContent />
    </RequireAuth>
  )
}

function ReportContent() {
  const params = useParams<{ id: string }>()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Report>(`/interviews/${params.id}/report`)
      .then(setReport)
      .catch((e: Error) => setError(e.message))
  }, [params.id])

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
        <div className="text-center">
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard">Back to your interviews</Link>
          </Button>
        </div>
      </main>
    )
  }
  if (!report) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading report…
      </main>
    )
  }

  const when = report.end_time
    ? new Date(report.end_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : ''
  const indicator = report.integrity.indicator
  const strong = report.overall_score >= 80

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
          <Link href="/dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Download data-icon="inline-start" /> Save as PDF
            </Button>
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/setup">
                Practice again <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 lg:px-10 lg:py-14">
        <div className="flex flex-col justify-between gap-6 border-b border-border pb-8 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Interview report · #{String(report.interview_id).padStart(4, '0')}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">A useful readout of your answer.</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {report.role} · {report.difficulty}
              {when ? ` · ${when}` : ''}
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-6 lg:grid-cols-[250px_1fr]">
          <div className="flex flex-col items-center justify-center border border-border bg-card p-8 text-center">
            <span className="font-mono text-7xl tracking-[-0.1em] text-primary">{Math.round(report.overall_score)}</span>
            <span className="mt-2 text-sm text-muted-foreground">overall score</span>
            <span
              className={`mt-5 border px-3 py-1 text-xs font-medium ${
                strong ? 'border-primary/25 bg-primary/10 text-primary' : 'border-coral/30 bg-coral/10 text-coral'
              }`}
            >
              {strong ? 'Strong signal' : 'Keep practicing'}
            </span>
            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              The overall score is a weighted average of the four indicators. Proctoring is reported separately and is
              not part of the score.
            </p>
          </div>

          <div className="space-y-6 border border-border bg-card p-8">
            <ScoreBar label="Answer quality" value={report.answer_quality} hint="Relevance and completeness, evaluated by AI" />
            <ScoreBar label="Response structure" value={report.response_structure} hint="How logically each answer was organised" />
            <ScoreBar label="Speech fluency" value={report.speech_fluency} hint="Speaking pace, filler words and consistency" />
            <ScoreBar
              label="Gaze and attention"
              value={report.gaze_attention}
              hint="Share of camera frames with your face detected and facing the camera"
            />
          </div>
        </section>

        <section className="mt-6 border border-border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-medium">Proctoring summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {INDICATOR_TEXT[indicator] ?? ''} ({report.integrity.event_count} event
            {report.integrity.event_count === 1 ? '' : 's'})
          </p>
          {report.events.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-4 font-medium">Time</th>
                    <th className="py-1.5 pr-4 font-medium">Event</th>
                    <th className="py-1.5 font-medium">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.events.map((event, index) => (
                    <tr key={index}>
                      <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-1.5 pr-4">{EVENT_LABELS[event.event_type] ?? event.event_type}</td>
                      <td className="py-1.5 capitalize">{event.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {(report.strengths.length > 0 || report.improvements.length > 0) && (
          <section className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="border border-border bg-card p-6">
              <h2 className="text-xl font-medium">What worked</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                {report.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="border border-border bg-card p-6">
              <h2 className="text-xl font-medium">What to work on</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                {report.improvements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-xl font-medium">Question by question</h2>
          <div className="mt-3 space-y-3">
            {report.questions.map((question, index) => (
              <details key={index} className="border border-border bg-card p-5">
                <summary className="cursor-pointer text-sm font-medium">
                  {index + 1}. {question.question_text}
                  <span className="ml-2 font-mono text-muted-foreground">({Math.round(question.answer_score)})</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">
                  Relevance {Math.round(question.relevance)} · Completeness {Math.round(question.completeness)} ·
                  Structure {Math.round(question.structure)} · {Math.round(question.speaking_rate)} wpm ·{' '}
                  {question.filler_count} filler word{question.filler_count === 1 ? '' : 's'} ·{' '}
                  {Math.round(question.duration_sec)}s
                </p>
                <p className="mt-3 text-sm">{question.feedback}</p>
                <p className="mt-3 text-sm font-medium">Transcript</p>
                <p className="mt-1 text-sm text-muted-foreground">{question.transcript || 'No speech detected.'}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/setup">Start another interview</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to your interviews</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
