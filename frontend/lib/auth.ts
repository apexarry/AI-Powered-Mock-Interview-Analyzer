import { api } from './api'
import type { User } from './types'

export type { User }

export interface AuthResult {
  access_token: string
  token_type: string
  user: User
}

export function fetchMe(): Promise<User> {
  return api<User>('/auth/me')
}

export function loginRequest(email: string, password: string): Promise<AuthResult> {
  return api<AuthResult>('/auth/login', {
    json: { email, password },
  })
}

export function registerRequest(
  name: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  return api<AuthResult>('/auth/register', {
    json: { name, email, password },
  })
}
