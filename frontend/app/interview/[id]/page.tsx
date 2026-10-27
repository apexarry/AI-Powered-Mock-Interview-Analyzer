'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, Mic2, ScanFace } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { RequireAuth } from '@/components/require-auth'
import { api } from '@/lib/api'
import { captureFrame, formatClock } from '@/lib/capture'
import { useMediaStream } from '@/hooks/useMediaStream'
import { useMicLevel } from '@/hooks/useMicLevel'
import { useProctoring } from '@/hooks/useProctoring'
import { useRecorder } from '@/hooks/useRecorder'
import type { Answer, DeviceCheck, Interview, Question } from '@/lib/types'

const QUESTION_LIMIT_SECONDS = 120

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'idle' }) {
  const dot = tone === 'ok' ? 'bg-primary' : tone === 'warn' ? 'bg-coral' : 'bg-muted-foreground'
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-medium">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden />
        {value}
      </span>
    </div>
  )
}

export default function InterviewPage() {
  return (
    <RequireAuth>
      <InterviewContent />
    </RequireAuth>
  )
}

function InterviewContent() {
  const params = useParams<{ id: string }>()
  const interviewId = Number(params.id)
  const router = useRouter()

  const [interview, setInterview] = useState<Interview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [check, setCheck] = useState<DeviceCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [pending, setPending] = useState<{ blob: Blob; question: Question } | null>(null)
  const [reviewing, setReviewing] = useState<{ question: Question; answer: Answer } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_LIMIT_SECONDS)
  const [elapsed, setElapsed] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const media = useMediaStream()
  const mic = useMicLevel(media.stream)
  const recorder = useRecorder(media.stream)

  // ---- load interview and start the camera
  useEffect(() => {
    api<Interview>(`/interviews/${interviewId}`)
      .then((iv) => {
        if (iv.status === 'completed') router.replace(`/report/${interviewId}`)
        else if (iv.status === 'abandoned') router.replace('/dashboard')
        else setInterview(iv)
      })
      .catch((e: Error) => setLoadError(e.message))
  }, [interviewId, router])

  const { request: requestMedia, stop: stopMedia } = media
  useEffect(() => {
    void requestMedia()
  }, [requestMedia])

  const hasInterview = interview !== null
  useEffect(() => {
    if (videoRef.current && media.stream) videoRef.current.srcObject = media.stream
  }, [media.stream, hasInterview])

  // ---- fullscreen state
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  // ---- notices fade after a few seconds
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 7000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const live = interview?.status === 'in_progress'
  const { face } = useProctoring({
    enabled: live && !finishing,
    interviewId,
    stream: media.stream,
    videoRef,
    onNotice: setNotice,
  })

  // ---- session clock
  useEffect(() => {
    if (!live || !interview?.start_time) return
    const started = new Date(interview.start_time).getTime()
    const tick = () => setElapsed((Date.now() - started) / 1000)
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [live, interview?.start_time])

  const questions = interview?.questions ?? []
  const current = questions.find((q) => !q.answered)
  const answeredCount = questions.filter((q) => q.answered).length
  const total = questions.length
  const position = reviewing
    ? questions.findIndex((q) => q.question_id === reviewing.question.question_id) + 1
    : answeredCount + 1
  const hasMore = questions.some((q) => !q.answered)

  // ---- device check and start
  async function runFaceCheck() {
    const video = videoRef.current
    if (!video) return
    setChecking(true)
    setError(null)
    try {
      const blob = await captureFrame(video)
      if (!blob) throw new Error('The camera is not ready yet. Wait a moment and try again.')
      const form = new FormData()
      form.append('image', blob, 'check.jpg')
      const result = await api<DeviceCheck>(`/interviews/${interviewId}/device-check`, { form })
      setCheck(result)
      if (result.ok) setInterview((prev) => (prev ? { ...prev, status: 'ready' } : prev))
    } catch (err) {
      setError(errorMessage(err, 'Face check failed.'))
    } finally {
      setChecking(false)
    }
  }

  async function beginInterview() {
    setStarting(true)
    setError(null)
    try {
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        /* handled below */
      }
      if (!document.fullscreenElement) {
        throw new Error('Fullscreen is required for the proctored session. Allow fullscreen and try again.')
      }
      const started = await api<Interview>(`/interviews/${interviewId}/start`, { method: 'POST' })
      setInterview(started)
    } catch (err) {
      setError(errorMessage(err, 'Could not start the interview.'))
    } finally {
      setStarting(false)
    }
  }

  // ---- answering
  const submit = useCallback(
    async (blob: Blob, question: Question) => {
      setSubmitting(true)
      setError(null)
      try {
        const form = new FormData()
        form.append('audio', blob, `answer.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
        const answer = await api<Answer>(`/interviews/${interviewId}/questions/${question.question_id}/answer`, {
          form,
        })
        setPending(null)
        setReviewing({ question, answer })
        setInterview((prev) =>
          prev
            ? {
                ...prev,
                questions: prev.questions.map((q) =>
                  q.question_id === question.question_id ? { ...q, answered: true } : q,
                ),
              }
            : prev,
        )
      } catch (err) {
        setPending({ blob, question })
        setError(errorMessage(err, 'Could not submit your answer.'))
      } finally {
        setSubmitting(false)
      }
    },
    [interviewId],
  )

  const { start: startRecording, stop: stopRecording, recording } = recorder

  const stopAndSubmit = useCallback(async () => {
    const question = current
    const blob = await stopRecording()
    if (!question) return
    if (!blob || blob.size === 0) {
      setError('No audio was captured. Check your microphone and try again.')
      return
    }
    await submit(blob, question)
  }, [current, stopRecording, submit])

  const stopRef = useRef(stopAndSubmit)
  useEffect(() => {
    stopRef.current = stopAndSubmit
  }, [stopAndSubmit])

  function startAnswer() {
    setError(null)
    try {
      startRecording()
      setSecondsLeft(QUESTION_LIMIT_SECONDS)
    } catch (err) {
      setError(errorMessage(err, 'Could not start recording.'))
    }
  }

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(timer)
          void stopRef.current()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [recording])

  async function finish() {
    setFinishing(true)
    setError(null)
    try {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      stopMedia()
      router.push(`/processing/${interviewId}`)
    } catch (err) {
      setError(errorMessage(err, 'Could not finish the interview.'))
      setFinishing(false)
    }
  }

  // ---- render
  if (loadError) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
        <div className="text-center">
          <p role="alert" className="text-sm text-red-500">
            {loadError}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    )
  }
  if (!interview) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </main>
    )
  }

  const cameraOk = !!media.stream && !media.lost
  const faceReady = interview.status === 'ready' || live
  const faceTone = !face ? 'idle' : face.face_count === 1 && face.attentive ? 'ok' : 'warn'
  const faceText = !face
    ? 'Waiting for first frame'
    : face.face_count === 0
      ? 'Not visible'
      : face.face_count > 1
        ? 'More than one face'
        : face.attentive
          ? 'Detected, facing camera'
          : 'Detected, looking away'

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Exit session
          </Link>
          <Logo />
          <span className="font-mono text-xs text-muted-foreground">
            {live ? `QUESTION ${String(Math.min(position, total)).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : `${interview.role}`}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-live="polite">
            {notice && (
              <p className="mb-4 border border-coral/40 bg-coral/10 px-4 py-2.5 text-sm">{notice}</p>
            )}
            {live && !isFullscreen && !finishing && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-coral/40 bg-coral/10 px-4 py-2.5 text-sm">
                <span>You left fullscreen. Return to fullscreen to keep answering.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
                >
                  Return to fullscreen
                </Button>
              </div>
            )}
            {live && media.lost && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-coral/40 bg-coral/10 px-4 py-2.5 text-sm">
                <span>Your camera or microphone disconnected. Your earlier answers are saved.</span>
                <Button variant="outline" size="sm" onClick={() => void requestMedia()}>
                  Reconnect
                </Button>
              </div>
            )}

            {!live && (
              <div className="border border-border bg-card p-6 sm:p-8">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Before you begin</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Check your signal</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {interview.role} · {interview.difficulty} · {total} questions
                </p>

                <ol className="mt-7 space-y-6">
                  <li className="flex gap-4">
                    <span className="grid size-9 shrink-0 place-items-center bg-primary/10 text-primary">
                      <Mic2 className="size-4" />
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">Camera and microphone</p>
                      {media.error ? (
                        <div className="mt-1">
                          <p role="alert" className="text-sm text-red-500">
                            {media.error}
                          </p>
                          <Button variant="outline" size="sm" className="mt-2" onClick={() => void requestMedia()}>
                            Try again
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {cameraOk ? 'Camera is on.' : 'Waiting for permission…'}
                        </p>
                      )}
                      <div className="mt-3 h-2 bg-muted" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mic.level * 100)}>
                        <div className="h-2 bg-primary transition-[width]" style={{ width: `${mic.level * 100}%` }} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {mic.heard ? 'Microphone is working.' : 'Say a few words to test your microphone.'}
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="grid size-9 shrink-0 place-items-center bg-primary/10 text-primary">
                      <ScanFace className="size-4" />
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">Face check</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sit alone, face the camera, and keep your face well lit.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => void runFaceCheck()}
                        disabled={!cameraOk || checking}
                      >
                        {checking ? 'Checking…' : faceReady ? 'Check again' : 'Check my face'}
                      </Button>
                      {check && (
                        <p role="status" className={`mt-2 text-sm ${check.ok ? 'text-primary' : 'text-coral'}`}>
                          {check.message}
                        </p>
                      )}
                      {faceReady && !check && <p className="mt-2 text-sm text-primary">Face check passed.</p>}
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="grid size-9 shrink-0 place-items-center bg-primary/10 text-primary">
                      <Camera className="size-4" />
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">What is monitored</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Switching tabs, leaving fullscreen, your face leaving the frame, a second face appearing, and
                        camera or microphone drop-outs are logged with a time. Nothing is locked: the log appears in your
                        report next to your scores.
                      </p>
                    </div>
                  </li>
                </ol>

                {error && (
                  <p role="alert" className="mt-4 text-sm text-red-500">
                    {error}
                  </p>
                )}
                <Button
                  className="mt-6"
                  onClick={() => void beginInterview()}
                  disabled={!faceReady || !mic.heard || !cameraOk || starting}
                >
                  {starting ? 'Starting…' : 'Begin interview in fullscreen'}
                </Button>
                {faceReady && !mic.heard && (
                  <p className="mt-2 text-xs text-muted-foreground">Test your microphone to continue.</p>
                )}
              </div>
            )}

            {live && (
              <div className="border border-border bg-card p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    Question {Math.min(position, total)} of {total}
                    {(reviewing?.question ?? current) ? ` · ${(reviewing?.question ?? current)!.category}` : ''}
                  </span>
                  <span className="font-mono text-xs">Session time {formatClock(elapsed)}</span>
                </div>

                {!reviewing && current && (
                  <>
                    <h1 className="mt-5 text-2xl font-medium leading-snug tracking-[-0.03em] sm:text-3xl">
                      {current.question_text}
                    </h1>

                    <div className="mt-8 flex flex-wrap items-center gap-4">
                      {!recording && !submitting && !pending && (
                        <Button onClick={startAnswer} disabled={!isFullscreen || media.lost || finishing}>
                          Start answer
                        </Button>
                      )}
                      {recording && (
                        <>
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span className="size-2.5 animate-pulse rounded-full bg-coral" aria-hidden />
                            Recording · {formatClock(secondsLeft)} left
                          </span>
                          <Button onClick={() => void stopAndSubmit()}>Stop and submit</Button>
                        </>
                      )}
                      {submitting && (
                        <p role="status" className="text-sm text-muted-foreground">
                          Transcribing and evaluating your answer…
                        </p>
                      )}
                      {!recording && !submitting && pending && (
                        <Button onClick={() => void submit(pending.blob, pending.question)}>
                          Retry submitting this answer
                        </Button>
                      )}
                    </div>
                    {!recording && !submitting && !pending && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        You have {formatClock(QUESTION_LIMIT_SECONDS)} per answer. Answers are recorded as audio only.
                      </p>
                    )}
                  </>
                )}

                {reviewing && (
                  <div className="mt-5">
                    <h1 className="text-xl font-medium leading-snug">{reviewing.question.question_text}</h1>
                    <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                      {(
                        [
                          ['Answer', reviewing.answer.answer_score],
                          ['Structure', reviewing.answer.structure],
                          ['Pace (wpm)', reviewing.answer.speaking_rate],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="border border-border px-2 py-3">
                          <p className="font-mono text-2xl text-primary">{Math.round(value)}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-relaxed">{reviewing.answer.feedback}</p>
                    {reviewing.answer.improvements.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {reviewing.answer.improvements.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                    <details className="mt-4 text-sm">
                      <summary className="cursor-pointer font-medium">What we heard</summary>
                      <p className="mt-2 text-muted-foreground">
                        {reviewing.answer.transcript || 'No speech detected.'}
                      </p>
                    </details>
                    <div className="mt-6">
                      {hasMore ? (
                        <Button onClick={() => setReviewing(null)}>Next question</Button>
                      ) : (
                        <Button onClick={() => void finish()} disabled={finishing}>
                          {finishing ? 'Building your report…' : 'Finish and see report'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {!reviewing && !current && (
                  <div className="mt-6">
                    <p className="text-sm text-muted-foreground">All questions are answered.</p>
                    <Button className="mt-3" onClick={() => void finish()} disabled={finishing}>
                      {finishing ? 'Building your report…' : 'Finish and see report'}
                    </Button>
                  </div>
                )}

                {error && (
                  <p role="alert" className="mt-4 text-sm text-red-500">
                    {error}
                  </p>
                )}
              </div>
            )}
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden border border-border bg-card">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="aspect-[4/3] w-full -scale-x-100 bg-black object-cover"
                />
                {recording && (
                  <span className="absolute left-3 top-3 flex items-center gap-1.5 bg-black/70 px-2 py-1 text-xs font-medium text-white">
                    <span className="size-2 animate-pulse rounded-full bg-coral" aria-hidden /> Recording
                  </span>
                )}
              </div>
              <div className="divide-y divide-border px-4">
                <StatusRow
                  label="Camera"
                  value={cameraOk ? 'Live' : media.lost ? 'Disconnected' : 'Off'}
                  tone={cameraOk ? 'ok' : 'warn'}
                />
                <StatusRow
                  label="Microphone"
                  value={media.lost ? 'Disconnected' : mic.heard ? 'Working' : 'Not tested'}
                  tone={media.lost ? 'warn' : mic.heard ? 'ok' : 'idle'}
                />
                <StatusRow
                  label="Face"
                  value={live ? faceText : faceReady ? 'Check passed' : 'Not checked'}
                  tone={live ? faceTone : faceReady ? 'ok' : 'idle'}
                />
                <StatusRow
                  label="Fullscreen"
                  value={isFullscreen ? 'On' : 'Off'}
                  tone={isFullscreen ? 'ok' : live ? 'warn' : 'idle'}
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Frames are analysed on the server to count faces and are not stored.
            </p>
            {faceReady && !check && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
                <Check className="size-3.5" /> Face check passed
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
