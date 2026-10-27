'use client'

import { Field, PageShell } from '@/components/page-shell'
import { RequireAuth } from '@/components/require-auth'
import { useAuth } from '@/components/auth-provider'

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  )
}

function ProfileContent() {
  const { user } = useAuth()

  return (
    <PageShell>
      <section className="mx-auto max-w-3xl py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Account</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">Profile and settings</h1>
        <p className="mt-3 text-muted-foreground">
          Your account details. Name and email are managed when you register.
        </p>

        <div className="mt-10 border border-border bg-card p-7">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Full name" value={user?.name ?? ''} disabled />
            <Field label="Email" value={user?.email ?? ''} type="email" disabled />
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Editing your profile is not available yet. Contact support if your details need to change.
          </p>
        </div>
      </section>
    </PageShell>
  )
}
