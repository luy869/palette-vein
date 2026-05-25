import { useState, useEffect } from 'react'
import type { Image } from '../types'
async function fetchLikes(): Promise<Image[]> {
  const res = await fetch('/api/likes')
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

  if (loading) return <p style={{ color: '#aaa' }}>読み込み中...</p>
  if (error) return <p style={{ color: '#f66' }}>{error}</p>
  if (images.length === 0) return <p style={{ color: '#888' }}>まだいいねした画像がありません</p>

  return (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>{images.length} 件</p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
      }}>
        {images.map(img => (
          <div key={img.id} style={{ borderRadius: 8, overflow: 'hidden' }}>
            <img
              src={img.thumb_url}
              alt={img.wallhaven_id}
              style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
