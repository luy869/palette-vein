import type { Image, RecommendResponse, User } from '../types'

const opts: RequestInit = { credentials: 'include' }

export async function fetchDiscover(excludeIds: number[] = [], signal?: AbortSignal): Promise<Image[]> {
  const params = new URLSearchParams()
  if (excludeIds.length > 0) params.set('exclude', excludeIds.join(','))
  const res = await fetch(`/api/discover?${params}`, { ...opts, signal })
  if (!res.ok) throw new Error(`fetchDiscover: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export async function fetchImages(page = 1, sorting = 'toplist', query = '', signal?: AbortSignal): Promise<Image[]> {
  const params = new URLSearchParams({ page: String(page), sorting })
  if (query) params.set('q', query)
  const res = await fetch(`/api/images?${params}`, { ...opts, signal })
  if (!res.ok) throw new Error(`fetchImages: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export async function fetchSearch(q: string, signal?: AbortSignal): Promise<Image[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { ...opts, signal })
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

export async function fetchRecommendations(excludeIds: number[] = [], signal?: AbortSignal): Promise<RecommendResponse> {
  const params = new URLSearchParams()
  if (excludeIds.length > 0) params.set('exclude', excludeIds.join(','))
  const res = await fetch(`/api/recommend?${params}`, { ...opts, signal })
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

export async function fetchLikes(cursor?: number, signal?: AbortSignal): Promise<{ images: Image[]; next_cursor: number | null }> {
  const params = new URLSearchParams({ limit: '24' })
  if (cursor != null) params.set('cursor', String(cursor))
  const res = await fetch(`/api/likes?${params}`, { ...opts, signal })
  if (!res.ok) throw new Error(`fetchLikes: HTTP ${res.status}`)
  return res.json()
}

export async function unlike(imageId: number): Promise<void> {
  const res = await fetch('/api/feedback', {
    ...opts,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId }),
  })
  if (!res.ok) throw new Error(`unlike: HTTP ${res.status}`)
}

export async function searchByColor(hex: string, signal?: AbortSignal): Promise<Image[]> {
  const res = await fetch(`/api/search/color?hex=${encodeURIComponent(hex)}`, { ...opts, signal })
  if (!res.ok) throw new Error(`searchByColor: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export async function searchByImage(file: File, signal?: AbortSignal): Promise<Image[]> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/search/image', { ...opts, method: 'POST', body: form, signal })
  if (!res.ok) throw new Error(`searchByImage: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}
