import { useEffect, useState } from 'react'
import { fetchImages, postFeedback } from '../api/client'
import { ImageCard } from './ImageCard'
import type { Image } from '../types'

export function ImageGrid() {
  const [images, setImages] = useState<Image[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchImages(page)
      .then(setImages)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [page])

  const handleFeedback = async (id: number, kind: 'like' | 'skip') => {
    try {
      await postFeedback(id, kind)
      setImages(prev => prev.filter(img => img.id !== id))
    } catch (e) {
      console.error('feedback error:', e)
    }
  }

  return (
    <div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading && <p className="text-slate-500 text-sm mb-4">読み込み中...</p>}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {images.map(img => (
          <ImageCard key={img.id} image={img} onFeedback={handleFeedback} />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-8">
        <button
          disabled={page === 1 || loading}
          onClick={() => setPage(p => p - 1)}
          className="px-4 py-1.5 text-sm glass rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← 前
        </button>
        <span className="text-slate-500 text-sm">ページ {page}</span>
        <button
          disabled={loading}
          onClick={() => setPage(p => p + 1)}
          className="px-4 py-1.5 text-sm glass rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          次 →
        </button>
      </div>
    </div>
  )
}
