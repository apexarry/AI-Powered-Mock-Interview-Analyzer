'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { FormField } from '@/components/form-field'
import { Logo } from '@/components/logo'
import { GuestOnly } from '@/components/require-auth'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

export default function RegisterPage() {
  return (
    <GuestOnly>
      <RegisterContent />
    </GuestOnly>
  )
}

function RegisterContent() {
  const router = useRouter()
  const { register } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(fullName, email, password)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-md">
        <Link href="/">
          <Logo />
        </Link>
        <div className="mt-10 border border-border bg-card p-7">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Create account</p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight">Start with a clear signal</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Build a private practice record that shows where your answers are improving.
          </p>
          <form className="mt-8 flex flex-col gap-5" onSubmit={onSubmit}>
            <FormField label="Full name" value={fullName} onChange={setFullName} autoComplete="name" />
            <FormField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            <FormField label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              Create account <ArrowRight data-icon="inline-end" />
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}