import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, tokenStore } from '@/lib/api'
import { fetchMe, loginRequest, registerRequest } from '@/lib/auth'

const USER = { user_id: 1, name: 'Alex Morgan', email: 'alex@example.com' }
const AUTH = { access_token: 'jwt-token', token_type: 'bearer', user: USER }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('auth requests', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    tokenStore.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStore.clear()
  })

  it('loginRequest posts email and password and returns the token envelope', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(AUTH))

    const result = await loginRequest('alex@example.com', 'secret123')

    expect(result).toEqual(AUTH)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((url as string).endsWith('/auth/login')).toBe(true)
    expect(JSON.parse((init.body as string).toString())).toEqual({
      email: 'alex@example.com',
      password: 'secret123',
    })
  })

  it('registerRequest posts name, email and password', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(AUTH))

    const result = await registerRequest('Alex Morgan', 'alex@example.com', 'secret123')

    expect(result).toEqual(AUTH)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse((init.body as string).toString())).toEqual({
      name: 'Alex Morgan',
      email: 'alex@example.com',
      password: 'secret123',
    })
  })

  it('fetchMe returns the current user', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(USER))
    await expect(fetchMe()).resolves.toEqual(USER)
  })

  it('rejects with ApiError on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Short' }, 422))
    await expect(loginRequest('a@b.com', 'x')).rejects.toBeInstanceOf(ApiError)
  })
})
