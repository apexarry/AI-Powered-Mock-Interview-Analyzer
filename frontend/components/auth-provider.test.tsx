import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuth, AuthProvider } from '@/components/auth-provider'
import { tokenStore } from '@/lib/api'

const USER = { user_id: 1, name: 'Alex Morgan', email: 'alex@example.com' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function Harness() {
  const { user, loading } = useAuth()
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="user">{user ? user.name : 'none'}</span>
    </div>
  )
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    tokenStore.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStore.clear()
  })

  it('resolves the current user on mount when a token is present', async () => {
    tokenStore.set('jwt-token')
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(USER))

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('loading')
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Alex Morgan'))
    expect(screen.getByTestId('loading')).toHaveTextContent('ready')
  })

  it('stays signed out when there is no token', async () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })
})
