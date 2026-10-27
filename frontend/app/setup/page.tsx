'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, FileText, Mic2, ScanFace } from 'lucide-react'

import { PageShell } from '@/components/page-shell'
import { RequireAuth } from '@/components/require-auth'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { Interview, Options } from '@/lib/types'

export default function SetupPage() {
  return (
    <RequireAuth>
      <SetupContent />
    </RequireAuth>
  )
}

function SetupContent() {
  const router = useRouter()
  const [options, setOptions] = useState<Options | null>(null)
  const [role, setRole] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Options>('/interviews/options')
      .then((o) => {
        setOptions(o)
        setRole(o.roles[0])
        setDifficulty(o.difficulties[1] ?? o.difficulties[0])
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const interview = await api<Interview>('/interviews', { json: { role, difficulty } })
      router.push(`/interview/${interview.interview_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the interview.')
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-4xl py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Interview setup</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">Tune the room to your next role</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Choose a focused practice session. Your questions are generated for that choice.
        </p>

        {!options && !error && <p className="mt-10 text-sm text-muted-foreground">Loading options…</p>}
        {!options && error && (
          <p role="alert" className="mt-10 text-sm text-red-500">
            {error}
          </p>
        )}

        {options && (
          <form onSubmit={onSubmit} className="mt-10 grid gap-8 lg:grid-cols-[1fr_0.8fr]">
            <div className="border border-border bg-card p-7">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-muted-foreground">Target role</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="h-11 border border-input bg-card px-3 outline-none focus:border-primary"
                >
                  {options.roles.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="mt-8">
                <legend className="text-sm text-muted-foreground">
                  Difficulty · {options.questions_per_interview} questions
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {options.difficulties.map((level) => (
                    <label
                      key={level}
                      className="cursor-pointer border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="radio"
                        name="level"
                        value={level}
                        checked={difficulty === level}
                        onChange={() => setDifficulty(level)}
                        className="sr-only"
                      />
                      <span className="text-sm">{level}</span>
                      {difficulty === level && <Check className="ml-auto mt-2 size-4 text-primary" />}
                    </label>
                  ))}
                </div>
              </fieldset>

              {error && (
                <p role="alert" className="mt-6 text-sm text-red-500">
                  {error}
                </p>
              )}

              <Button type="submit" className="mt-9 w-full" disabled={busy}>
                {busy ? 'Preparing your questions…' : 'Continue to camera check'}
                {!busy && <ArrowRight data-icon="inline-end" />}
              </Button>
            </div>

            <aside className="border border-border bg-card p-7">
              <p className="text-sm font-medium">What to expect</p>
              <ul className="mt-5 flex flex-col gap-5 text-sm">
                <li className="flex gap-3">
                  <Mic2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    Answer {options.questions_per_interview} spoken questions. Each answer is capped at two minutes.
                  </span>
                </li>
                <li className="flex gap-3">
                  <ScanFace className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    Sit alone and face the camera. Frames are analysed for faces and never stored.
                  </span>
                </li>
                <li className="flex gap-3">
                  <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    Finish to get a scored report with a transcript and one clear next step.
                  </span>
                </li>
              </ul>
            </aside>
          </form>
        )}
      </section>
    </PageShell>
  )
}
