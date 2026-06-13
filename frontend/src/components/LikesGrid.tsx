import { useState, useEffect, useRef, useCallback } from 'react'
import type { Image } from '../types'
import { fetchLikes, unlike, postFeedback } from '../api/client'
import { ImageModal } from './ImageModal'
import { SkeletonGrid } from './SkeletonCard'
import { useToast } from '../lib/toast'
import { useImageModal } from '../lib/useImageModal'
import { GRID_COLUMNS } from '../lib/grid'

export function LikesGrid() {
  const { push: toast } = useToast()
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<number | null | undefined>(undefined)
  const modal = useImageModal(images)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async (cursor?: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (cursor === undefined) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    try {
      const data = await fetchLikes(cursor, controller.signal)
      setImages(prev => cursor === undefined ? data.images : [...prev, ...data.images])
      setNextCursor(data.next_cursor)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
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

  function handleUnlike(id: number) {
    const idx = images.findIndex(img => img.id === id)
    const removed = images[idx]
    if (!removed) return

    // 楽観的に即削除
    setImages(prev => prev.filter(img => img.id !== id))

    unlike(id)
      .then(() => {
        toast('いいねを解除しました', 'success', {
          label: '取り消す',
          onClick: () => {
            postFeedback(id, 'like').catch(() => toast('取り消しに失敗しました', 'error'))
            setImages(prev => {
              if (prev.some(img => img.id === id)) return prev
              const next = [...prev]
              next.splice(Math.min(idx, next.length), 0, removed)
              return next
            })
          },
        })
      })
      .catch(() => {
        toast('いいね解除に失敗しました', 'error')
        // 失敗時は復元
        setImages(prev => {
          if (prev.some(img => img.id === id)) return prev
          const next = [...prev]
          next.splice(Math.min(idx, next.length), 0, removed)
          return next
        })
      })
  }

  if (loading) return <SkeletonGrid count={8} columns={GRID_COLUMNS} />
  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (images.length === 0) return <p className="text-slate-600 text-sm">まだいいねした画像がありません</p>

  return (
    <>
      <p className="text-xs text-slate-500 mb-5">{images.length} 件{nextCursor != null ? '+' : ''}</p>
      <div className="grid gap-4" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        {images.map(img => (
          <div key={img.id} className="card group relative">
            <div className="relative cursor-pointer" onClick={() => modal.open(img.id)}>
              <img
                src={img.thumb_url}
                alt={`壁紙 ${img.width}×${img.height}`}
                referrerPolicy="no-referrer"
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

      {modal.image && (
        <ImageModal
          image={modal.image}
          onClose={modal.close}
          onPrev={modal.prev}
          onNext={modal.next}
          hasPrev={modal.hasPrev}
          hasNext={modal.hasNext}
          index={modal.index ?? undefined}
          total={modal.total}
        />
      )}
    </>
  )
}
