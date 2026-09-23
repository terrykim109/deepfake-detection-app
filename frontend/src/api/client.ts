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

export interface AnalysisUsage {
  user_id: string
  active: boolean
  request_timestamps: string[]
  count_24h: number
  max_24h: number
  remaining_24h: number
}

export interface TempImageInfo {
  image_id: string
  filename?: string
  size?: number
  stored_at?: string | null
  delete_by?: string
  deleted_at?: string | null
  delete_reason?: string
  lifetime_seconds?: number | null
  deleted?: boolean
  max_retention_seconds?: number
}

export interface AnalysisPrivacy {
  temporary_only?: boolean
  image_deleted?: boolean
  message: string
  stored_at?: string | null
  deleted_at?: string | null
  lifetime_seconds?: number | null
  max_retention_seconds?: number
}

export interface AnalysisStartResponse {
  ok: boolean
  usage: AnalysisUsage
  image: TempImageInfo
  privacy: AnalysisPrivacy
}

export interface AnalysisFinishResponse {
  ok: boolean
  outcome: 'success' | 'failure' | 'cancelled'
  usage: AnalysisUsage
  image: TempImageInfo
  privacy: AnalysisPrivacy
}

async function postForm<T>(path: string, form: FormData): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: errorMessage(data, res.status) }
    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
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

export const analysisApi = {
  usage: (userId: string) =>
    get<AnalysisUsage>(`/api/analysis/usage?user_id=${encodeURIComponent(userId)}`),

  validate: (userId: string, file: File) => {
    const form = new FormData()
    form.append('user_id', userId)
    form.append('file', file)
    return postForm<{ ok: boolean; usage: AnalysisUsage }>('/api/analysis/validate', form)
  },

  /** Stores the image temporarily and starts the analysis slot. */
  start: (userId: string, file: File) => {
    const form = new FormData()
    form.append('user_id', userId)
    form.append('file', file)
    return postForm<AnalysisStartResponse>('/api/analysis/start', form)
  },

  /** Deletes the temp image (success, failure, or cancel) and frees the slot. */
  finish: (userId: string, imageId: string, outcome: 'success' | 'failure' | 'cancelled') => {
    const form = new FormData()
    form.append('user_id', userId)
    form.append('image_id', imageId)
    form.append('outcome', outcome)
    return postForm<AnalysisFinishResponse>('/api/analysis/finish', form)
  },
}
