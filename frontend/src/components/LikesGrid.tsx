import { useState, useEffect } from 'react'
import type { Image } from '../types'
import { unlike } from '../api/client'
import { ImageModal } from './ImageModal'

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
  const [selected, setSelected] = useState<Image | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchLikes()
      .then(setImages)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleUnlike(id: number) {
    try {
      await unlike(id)
      setImages(prev => prev.filter(img => img.id !== id))
    } catch (e) {
      console.error('unlike error:', e)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">読み込み中...</p>
  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (images.length === 0) return <p className="text-slate-600 text-sm">まだいいねした画像がありません</p>

  return (
    <>
      <p className="text-xs text-slate-600 mb-5">{images.length} 件</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {images.map(img => (
          <div key={img.id} className="glass glass-hover rounded-xl overflow-hidden group">
            <div className="relative cursor-pointer" onClick={() => setSelected(img)}>
              <img
                src={img.thumb_url}
                alt={img.wallhaven_id}
                className="w-full block object-cover"
                style={{ aspectRatio: '16/9' }}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <a
                href={`https://wallhaven.cc/w/${img.wallhaven_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 hover:text-violet-400 transition-colors"
                onClick={e => e.stopPropagation()}
              >
                {img.width}×{img.height}
              </a>
              <button
                onClick={() => handleUnlike(img.id)}
                className="px-3 py-1 text-xs rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
              >
                解除
              </button>
            </div>
          </div>
        ))}
      </div>
      {selected && <ImageModal image={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
