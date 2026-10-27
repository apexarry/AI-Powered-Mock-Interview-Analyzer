'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, LogOut, Menu, Moon, Plus, Sun, X } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { Logo } from '@/components/logo'
import { useTheme } from '@/components/theme-provider'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/history', label: 'History' },
  { href: '/profile', label: 'Profile' },
]

export function SiteHeader() {
  const { user, logout } = useAuth()
  const { isNight, toggleNight } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <Link href="/dashboard">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleNight}
            aria-label={isNight ? 'Switch to day mode' : 'Switch to night mode'}
            aria-pressed={isNight}
            className="grid size-8 place-items-center border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {isNight ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <Link
            href="/setup"
            className="inline-flex h-8 items-center gap-1.5 bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> New interview
          </Link>
          {user && <span className="hidden text-xs text-muted-foreground sm:inline">{user.name}</span>}
          {user && (
            <button
              type="button"
              onClick={logout}
              className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="grid size-8 place-items-center border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="border-t border-border px-5 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            {user && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  logout()
                }}
                className="flex items-center gap-1.5 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}

export function PageShell({ children, back = 'Dashboard' }: { children: React.ReactNode; back?: string }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        {back !== 'none' && (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {back}
          </Link>
        )}
        {children}
      </div>
    </main>
  )
}

export function Field({
  label,
  value,
  type = 'text',
  disabled = false,
}: {
  label: string
  value?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type={type}
        defaultValue={value}
        disabled={disabled}
        className="h-11 border border-input bg-card px-3 outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-70"
      />
    </label>
  )
}

export function ThemeNote() {
  return (
    <p className="text-xs text-muted-foreground">
      <Sun className="mr-1 inline size-3" />
      Light canvas with a focused, low-noise readout.
    </p>
  )
}
