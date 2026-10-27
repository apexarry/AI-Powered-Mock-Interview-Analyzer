'use client'

import {
  ArrowRight,
  BarChart3,
  Check,
  CirclePlay,
  Clock3,
  FileText,
  Headphones,
  Mic2,
  Sparkles,
  Target,
} from 'lucide-react'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { useAuth } from '@/components/auth-provider'

const waveform = [18, 30, 46, 24, 56, 34, 68, 42, 72, 28, 52, 40, 64, 24, 48, 36, 58, 26, 44, 32, 54, 22, 38, 18]

function Waveform() {
  return (
    <div className="flex h-16 items-center gap-1.5" aria-label="Audio waveform preview" role="img">
      {waveform.map((height, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-primary/70"
          style={{ height: `${height}%` }}
        />
      ))}
      <span className="ml-1 h-9 w-px bg-primary" />
    </div>
  )
}

function ReportPreview() {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium">Interview report</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">#0428 · 12:14</span>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-[150px_1fr]">
        <div className="flex flex-col items-center justify-center border border-border bg-muted/40 p-5 text-center">
          <span className="font-mono text-5xl font-medium tracking-[-0.08em] text-primary">82</span>
          <span className="mt-1 text-xs text-muted-foreground">overall score</span>
          <span className="mt-4 border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">strong signal</span>
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Clarity</span>
              <span className="font-mono text-muted-foreground">88 / 100</span>
            </div>
            <div className="h-2 bg-muted"><div className="h-2 w-[88%] bg-primary" /></div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Structure</span>
              <span className="font-mono text-muted-foreground">79 / 100</span>
            </div>
            <div className="h-2 bg-muted"><div className="h-2 w-[79%] bg-primary" /></div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Confidence</span>
              <span className="font-mono text-muted-foreground">76 / 100</span>
            </div>
            <div className="h-2 bg-muted"><div className="h-2 w-[76%] bg-coral" /></div>
          </div>
          <p className="border-l-2 border-coral pl-3 text-sm leading-6 text-muted-foreground">
            Your answer had a clear point of view. Slow down slightly before your final takeaway.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  const { user } = useAuth()
  const startHref = user ? '/setup' : '/register'
  return (
    <main className="dark min-h-screen overflow-hidden bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-10">
          <a href="#top" aria-label="Signal home">
            <Logo />
          </a>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
            <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#report" className="transition-colors hover:text-foreground">Sample report</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href={user ? '/dashboard' : '/login'}>{user ? 'Dashboard' : 'Log in'}</Link>
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" asChild>
              <Link href={startHref}>Try a mock interview <ArrowRight data-icon="inline-end" /></Link>
            </Button>
          </div>
        </div>
      </header>

      <section id="top" className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-10 lg:pb-28 lg:pt-24">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" /> Practice with signal, not guesswork.
          </div>
          <h1 className="max-w-2xl text-balance text-5xl font-semibold tracking-[-0.06em] text-foreground sm:text-6xl lg:text-7xl">Your next interview starts with a better answer.</h1>
          <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">Signal gives you a private, realistic place to practice. Speak naturally, get measured feedback, and walk into the real thing with a plan.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-11 bg-primary px-5 text-primary-foreground hover:bg-primary/90" asChild>
              <Link href={startHref}>Start practicing <ArrowRight data-icon="inline-end" /></Link>
            </Button>
            <Button variant="outline" size="lg" className="h-11 px-5" asChild>
              <a href="#how-it-works"><CirclePlay data-icon="inline-start" /> See how it works</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><Check className="size-3.5 text-primary" aria-hidden="true" /> No credit card</span>
            <span className="flex items-center gap-2"><Check className="size-3.5 text-primary" aria-hidden="true" /> First session is free</span>
          </div>
        </div>

        <div className="relative border border-border bg-card p-5 sm:p-7">
          <div className="absolute -right-px -top-px h-12 w-12 border-l border-b border-primary/35" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
            <div><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Live practice session</p><h2 className="mt-2 text-xl font-medium tracking-tight">Tell me about a project you&apos;re proud of.</h2></div>
            <span className="flex shrink-0 items-center gap-1.5 border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" /> recording</span>
          </div>
          <div className="py-8"><Waveform /><div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted-foreground"><span>00:38</span><span>02:00 max</span></div></div>
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-5 text-center">
            <div><p className="font-mono text-lg font-medium">142</p><p className="mt-1 text-[11px] text-muted-foreground">words / min</p></div>
            <div><p className="font-mono text-lg font-medium">04</p><p className="mt-1 text-[11px] text-muted-foreground">filler words</p></div>
            <div><p className="font-mono text-lg font-medium text-coral">01</p><p className="mt-1 text-[11px] text-muted-foreground">long pause</p></div>
          </div>
          <div className="mt-6 flex items-center gap-3 bg-muted/60 p-3 text-xs text-muted-foreground"><Headphones className="size-4 shrink-0 text-primary" aria-hidden="true" /> Feedback appears as soon as you finish speaking.</div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-10 lg:py-24">
          <div className="max-w-2xl"><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">A tighter feedback loop</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Practice the part that actually changes outcomes.</h2></div>
          <div className="mt-14 grid gap-px border border-border bg-border md:grid-cols-3">
            {[{icon: Mic2, number:'01', title:'Answer naturally', text:'Choose a role, pick a question, and respond like you would in the room.'}, {icon: BarChart3, number:'02', title:'See the signal', text:'Your response is transcribed and measured across the skills that matter.'}, {icon: Target, number:'03', title:'Improve with intent', text:'Get one clear next step, then run it back until it feels like yours.'}].map(({icon: Icon, number, title, text}) => <article key={number} className="bg-card p-7 lg:p-9"><div className="flex items-center justify-between"><Icon className="size-5 text-primary" aria-hidden="true" /><span className="font-mono text-xs text-muted-foreground">{number}</span></div><h3 className="mt-12 text-xl font-medium tracking-tight">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section id="report" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[0.75fr_1.25fr] lg:items-center lg:px-10 lg:py-28">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Not just a transcript</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Know what landed. Know what to try next.</h2><p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">Signal turns a practice answer into a useful readout — strengths you can repeat, gaps you can close, and feedback you can act on before your next round.</p><Button variant="outline" className="mt-8" asChild><Link href="/report">Explore the report <ArrowRight data-icon="inline-end" /></Link></Button></div>
        <ReportPreview />
      </section>

      <section id="pricing" className="border-t border-border bg-primary text-primary-foreground"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-20"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary-foreground/65">The next interview is yours</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Build confidence one honest answer at a time.</h2></div><Button size="lg" variant="outline" className="h-11 shrink-0 border-primary-foreground/35 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" asChild><Link href={startHref}>Start for free <ArrowRight data-icon="inline-end" /></Link></Button></div></section>
      <footer className="border-t border-border"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-10"><span>© 2026 signal</span><span className="flex items-center gap-2"><Clock3 className="size-3.5" aria-hidden="true" /> Practice with purpose.</span></div></footer>
    </main>
  )
}
