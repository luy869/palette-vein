import { useState, useEffect, useRef, useCallback } from 'react'
import type { Image } from '../types'
import { fetchLikes, unlike } from '../api/client'
import { ImageModal } from './ImageModal'
import { SkeletonGrid } from './SkeletonCard'
import { useToast } from '../lib/toast'

export function LikesGrid() {
  const { push: toast } = useToast()
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null | undefined>(undefined)
  const [selected, setSelected] = useState<Image | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async (cursor?: number) => {
    if (cursor === undefined) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    try {
      const data = await fetchLikes(cursor)
      setImages(prev => cursor === undefined ? data.images : [...prev, ...data.images])
      setNextCursor(data.next_cursor)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!sentinelRef.current || nextCursor == null) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && nextCursor != null) {
        load(nextCursor)
      }
    }, { threshold: 0.1 })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [nextCursor, loadingMore, load])

  async function handleUnlike(id: number) {
    try {
      await unlike(id)
      setImages(prev => prev.filter(img => img.id !== id))
      toast('いいねを解除しました', 'success')
    } catch {
      toast('いいね解除に失敗しました', 'error')
    }
  }

  if (loading) return <SkeletonGrid count={8} columns="repeat(auto-fill, minmax(260px, 1fr))" />
  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (images.length === 0) return <p className="text-slate-600 text-sm">まだいいねした画像がありません</p>

  return (
    <>
      <p className="text-xs text-slate-500 mb-5">{images.length} 件{nextCursor != null ? '+' : ''}</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {images.map(img => (
          <div key={img.id} className="card group relative">
            <div className="relative cursor-pointer" onClick={() => setSelected(img)}>
              <img
                src={img.thumb_url}
                alt={img.wallhaven_id}
                className="w-full block object-cover"
                style={{ aspectRatio: '16/9' }}
                loading="lazy"
              />

              <span className="absolute bottom-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-black/50 text-white/80 select-none">
                {img.width}×{img.height}
              </span>

              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <a
                  href={`https://wallhaven.cc/w/${img.wallhaven_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 text-xs hover:text-white transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  ↗ Wallhaven
                </a>
                <button
                  onClick={e => { e.stopPropagation(); handleUnlike(img.id) }}
                  className="px-3 py-1 text-xs rounded-lg bg-white/20 hover:bg-red-500/60 text-white transition-colors"
                >
                  解除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className="h-4 mt-4" />
      {loadingMore && <p className="text-slate-500 text-sm text-center mt-2">読み込み中...</p>}

      {selected && <ImageModal image={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
