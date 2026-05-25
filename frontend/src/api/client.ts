import type { Image, RecommendResponse, User } from '../types'

const opts: RequestInit = { credentials: 'include' }

export async function fetchImages(page = 1, sorting = 'toplist', query = ''): Promise<Image[]> {
  const params = new URLSearchParams({ page: String(page), sorting })
  if (query) params.set('q', query)
  const res = await fetch(`/api/images?${params}`, opts)
  if (!res.ok) throw new Error(`fetchImages: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export async function fetchSearch(q: string): Promise<Image[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, opts)
  if (!res.ok) throw new Error(`fetchSearch: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export async function postFeedback(imageId: number, kind: 'like' | 'skip'): Promise<void> {
  const res = await fetch('/api/feedback', {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId, kind }),
  })
  if (!res.ok) throw new Error(`postFeedback: HTTP ${res.status}`)
}

export async function fetchRecommendations(): Promise<RecommendResponse> {
  const res = await fetch('/api/recommend', opts)
  if (!res.ok) throw new Error(`fetchRecommendations: HTTP ${res.status}`)
  return res.json() as Promise<RecommendResponse>
}

export async function me(): Promise<User | null> {
  const res = await fetch('/api/auth/me', opts)
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`me: HTTP ${res.status}`)
  return res.json() as Promise<User>
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch('/api/auth/login', {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.trim() || `login: HTTP ${res.status}`)
  }
  return res.json() as Promise<User>
}

export async function register(email: string, password: string): Promise<User> {
  const res = await fetch('/api/auth/register', {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.trim() || `register: HTTP ${res.status}`)
  }
  return res.json() as Promise<User>
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { ...opts, method: 'POST' })
}
