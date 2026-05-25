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
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && <p style={{ color: '#aaa' }}>読み込み中...</p>}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: 16,
      }}>
        {images.map(img => (
          <ImageCard key={img.id} image={img} onFeedback={handleFeedback} />
        ))}
      </div>
      <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          disabled={page === 1 || loading}
          onClick={() => setPage(p => p - 1)}
          style={{ padding: '6px 16px', cursor: 'pointer' }}
        >
          ← 前
        </button>
        <span style={{ color: '#aaa' }}>ページ {page}</span>
        <button
          disabled={loading}
          onClick={() => setPage(p => p + 1)}
          style={{ padding: '6px 16px', cursor: 'pointer' }}
        >
          次 →
        </button>
      </div>
    </div>
  )
}
