import { useEffect, useState, useCallback } from 'react'
import { postFeedback } from '../api/client'
import { ImageCard } from './ImageCard'
import { SkeletonGrid } from './SkeletonCard'
import { useToast } from '../lib/toast'
import type { Image } from '../types'

async function fetchDiscover(): Promise<Image[]> {
  const res = await fetch('/api/discover', { credentials: 'include' })
  if (!res.ok) throw new Error(`fetchDiscover: HTTP ${res.status}`)
  const data = await res.json()
  return data.images as Image[]
}

export function ImageGrid() {
  const { push: toast } = useToast()
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setImages(await fetchDiscover())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleFeedback = async (id: number, kind: 'like' | 'skip') => {
    try {
      await postFeedback(id, kind)
      setImages(prev => prev.filter(img => img.id !== id))
    } catch {
      toast('フィードバックの送信に失敗しました', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs text-slate-600">{images.length} 件</span>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1 text-xs glass rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
        >
          更新
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading
        ? <SkeletonGrid count={8} columns="repeat(auto-fill, minmax(320px, 1fr))" />
        : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {images.map(img => (
              <ImageCard key={img.id} image={img} onFeedback={handleFeedback} />
            ))}
          </div>
        )
      }
    </div>
  )
}
