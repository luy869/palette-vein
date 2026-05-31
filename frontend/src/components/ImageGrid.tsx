import { useEffect, useState, useCallback, useRef } from 'react'
import { postFeedback, fetchDiscover } from '../api/client'
import { ImageCard } from './ImageCard'
import { SkeletonGrid } from './SkeletonCard'
import { useToast } from '../lib/toast'
import type { Image } from '../types'

export function ImageGrid() {
  const { push: toast } = useToast()
  const [images, setImages] = useState<Image[]>([])
  const [displayedIds, setDisplayedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (more = false) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (more) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError(null)
    }
    try {
      const exclude = more ? displayedIds : []
      const newImages = await fetchDiscover(exclude, controller.signal)
      if (more) {
        setImages(prev => [...prev, ...newImages])
        setDisplayedIds(prev => [...prev, ...newImages.map(img => img.id)])
      } else {
        setImages(newImages)
        setDisplayedIds(newImages.map(img => img.id))
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(String(e))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [displayedIds])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sentinelRef.current || images.length === 0) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore) load(true)
    }, { threshold: 0.1 })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [images.length, loadingMore, load])

  const handleFeedback = async (id: number, kind: 'like' | 'skip') => {
    try {
      await postFeedback(id, kind)
      setImages(prev => prev.filter(img => img.id !== id))
      setDisplayedIds(prev => prev.filter(i => i !== id))
    } catch {
      toast('フィードバックの送信に失敗しました', 'error')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs text-slate-600">{images.length} 件</span>
        <button
          onClick={() => load(false)}
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

      <div ref={sentinelRef} className="h-4 mt-4" />
      {loadingMore && <p className="text-slate-500 text-sm text-center mt-2">読み込み中...</p>}
    </div>
  )
}
