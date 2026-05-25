import type { Image, RecommendResponse } from '../types'

export async function fetchImages(page = 1, sorting = 'toplist'): Promise<Image[]> {
  const res = await fetch(`/api/images?page=${page}&sorting=${sorting}`)
  if (!res.ok) throw new Error(`fetchImages: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export async function postFeedback(imageId: number, kind: 'like' | 'skip'): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId, kind }),
  })
  if (!res.ok) throw new Error(`postFeedback: HTTP ${res.status}`)
}

export async function fetchRecommendations(): Promise<RecommendResponse> {
  const res = await fetch('/api/recommend')
  if (!res.ok) throw new Error(`fetchRecommendations: HTTP ${res.status}`)
  return res.json() as Promise<RecommendResponse>
}
