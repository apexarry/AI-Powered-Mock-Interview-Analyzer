import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api, tokenStore } from '@/lib/api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    tokenStore.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStore.clear()
  })

  it('sends the bearer token and returns parsed JSON', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({ user_id: 1 }))
    tokenStore.set('test-token')

    const result = await api<{ user_id: number }>('/auth/me')

    expect(result).toEqual({ user_id: 1 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/me')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token' })
  })

  it('posts a JSON body with a content-type header', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await api('/auth/login', { json: { email: 'a@b.com', password: 'x' } })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.com', password: 'x' })
  })

  it('throws ApiError with backend detail on non-OK responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'Email is not valid' }, 422))

    const error = await api('/auth/me').catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).message).toBe('Email is not valid')
  })

  it('clears the token and emits auth:expired on a 401', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'Not authenticated' }, 401))
    tokenStore.set('stale-token')
    const onExpired = vi.fn()
    window.addEventListener('auth:expired', onExpired)

    await api('/auth/me').catch(() => undefined)

    expect(tokenStore.get()).toBeNull()
    expect(onExpired).toHaveBeenCalledTimes(1)
    window.removeEventListener('auth:expired', onExpired)
  })
})
