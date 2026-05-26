import { useState, useEffect } from 'react'
import type { Image } from '../types'

async function fetchLikes(): Promise<Image[]> {
  const res = await fetch('/api/likes', { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchLikes: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export function LikesGrid() {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchLikes()
      .then(setImages)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500 text-sm">読み込み中...</p>
  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (images.length === 0) return <p className="text-slate-600 text-sm">まだいいねした画像がありません</p>

  return (
    <div>
      <p className="text-xs text-slate-600 mb-5">{images.length} 件</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {images.map(img => (
          <div key={img.id} className="glass glass-hover rounded-xl overflow-hidden">
            <img
              src={img.thumb_url}
              alt={img.wallhaven_id}
              className="w-full block object-cover"
              style={{ aspectRatio: '16/9' }}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
