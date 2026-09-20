const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

interface ApiResponse<T> {
  data?: T
  error?: string
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          item && typeof item === 'object' && 'msg' in item
            ? String((item as { msg: unknown }).msg)
            : JSON.stringify(item),
        )
        .join('; ')
    }
  }
  return `Error ${status}`
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: errorMessage(data, res.status) }
    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

async function get<T>(path: string): Promise<ApiResponse<T>> {
  return request<T>(path)
}

async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

async function put<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export interface UserResponse {
  id: string
  user_id: string
  email: string
  display_name: string | null
  first_name?: string
  last_name?: string
  phone?: string
  auth_provider: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserResponse
}

export interface SessionConfig {
  timeout_minutes: number
}

export const authApi = {
  signup: (email: string, password: string, displayName?: string) =>
    post<TokenResponse>('/api/auth/signup', { email, password, display_name: displayName }),

  login: (email: string, password: string) =>
    post<TokenResponse>('/api/auth/login', { email, password }),

  logout: (userId?: string) =>
    post('/api/auth/logout', { user_id: userId }),

  me: (userId: string) =>
    get<UserResponse>(`/api/auth/me?user_id=${encodeURIComponent(userId)}`),

  sessionConfig: () => get<SessionConfig>('/api/auth/session-config'),

  syncUser: (user: {
    user_id: string
    email: string
    display_name?: string | null
    auth_provider?: string
  }) => post<UserResponse>('/api/users/sync', user),

  updateProfile: (userId: string, profile: { first_name?: string; last_name?: string; email?: string; phone?: string }) =>
    put<UserResponse>(`/api/users/${userId}/profile`, profile),
}
