const TOKEN_KEY = 'mock-interview-token'

export class ApiError extends Error {
  status: number

  constructor(status: number, detail?: string) {
    super(detail ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

export const tokenStore = {
  get: (): string | null =>
    typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY),
  set: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] }
      const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : ''
      return field ? `${field}: ${first.msg ?? fallback}` : (first.msg ?? fallback)
    }
  }
  return fallback
}

export interface RequestOptions {
  method?: string
  json?: unknown
  form?: FormData
}

/**
 * Fetch helper for the API.
 *
 * - Sends the JWT as an `Authorization: Bearer` header (kept in localStorage).
 * - Accepts JSON bodies or `FormData` uploads.
 * - On a 401 clears the token and dispatches `auth:expired` so the app can sign out.
 * - Throws `ApiError` with the backend's `detail` message on failure.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (options.form) {
    body = options.form
  } else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (response.status === 401 && token) {
    tokenStore.clear()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:expired'))
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, messageFrom(data, `Request failed (${response.status})`))
  }
  return data as T
}
