import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Image, RecommendItem } from '../types'
import { fetchRecommendations, postFeedback, deleteFeedback } from '../api/client'
import { RecommendCard } from './RecommendCard'
import { ImageModal } from './ImageModal'
import { SkeletonGrid } from './SkeletonCard'
import { useToast } from '../lib/toast'
import { useImageModal } from '../lib/useImageModal'
import { GRID_COLUMNS } from '../lib/grid'

export function RecommendGrid() {
  const { push: toast } = useToast()
  const [items, setItems] = useState<RecommendItem[]>([])
  const modalImages = useMemo(() => items.map(i => i.image), [items])
  const modal = useImageModal(modalImages)
  const [reasonMap, setReasonMap] = useState<Map<number, Image>>(new Map())
  const [mode, setMode] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayedIds, setDisplayedIds] = useState<Set<number>>(new Set())
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
      const exclude = more ? [...displayedIds] : []
      const data = await fetchRecommendations(exclude, controller.signal)
      const m = new Map<number, Image>()
      for (const img of data.reason_images_lookup) m.set(img.id, img)

      if (more) {
        const newItems = data.items.filter(i => !displayedIds.has(i.image.id))
        setItems(prev => [...prev, ...newItems])
        setDisplayedIds(prev => {
          const next = new Set(prev)
          newItems.forEach(i => next.add(i.image.id))
          return next
        })
        setReasonMap(prev => new Map([...prev, ...m]))
      } else {
        setItems(data.items)
        setMode(data.mode)
        setReasonMap(m)
        setDisplayedIds(new Set(data.items.map(i => i.image.id)))
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
    if (!sentinelRef.current || items.length === 0) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore) load(true)
    }, { threshold: 0.1 })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [items.length, loadingMore, load])

  const handleFeedback = (id: number, kind: 'like' | 'skip') => {
    const idx = items.findIndex(item => item.image.id === id)
    const removed = items[idx]
    if (!removed) return

    // 楽観的に即削除
    setItems(prev => prev.filter(item => item.image.id !== id))
    setDisplayedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

    postFeedback(id, kind)
      .then(() => {
        toast(kind === 'like' ? 'いいねしました' : 'スキップしました', 'success', {
          label: '取り消す',
          onClick: () => {
            deleteFeedback(id, kind).catch(() => toast('取り消しに失敗しました', 'error'))
            setItems(prev => {
              if (prev.some(item => item.image.id === id)) return prev
              const next = [...prev]
              next.splice(Math.min(idx, next.length), 0, removed)
              return next
            })
            setDisplayedIds(prev => {
              const next = new Set(prev)
              next.add(id)
              return next
            })
          },
        })
      })
      .catch(() => {
        toast('フィードバックの送信に失敗しました', 'error')
        // 失敗時は復元
        setItems(prev => {
          if (prev.some(item => item.image.id === id)) return prev
          const next = [...prev]
          next.splice(Math.min(idx, next.length), 0, removed)
          return next
        })
        setDisplayedIds(prev => {
          const next = new Set(prev)
          next.add(id)
          return next
        })
      })
  }

  if (loading) return <SkeletonGrid count={8} columns={GRID_COLUMNS} />
  if (error) return <p className="text-red-400 text-sm">{error}</p>

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs text-slate-600">
          {mode === 'toplist'
            ? '人気の壁紙を表示中 · いいねが10件たまるとあなた好みの推薦に切り替わります'
            : `あなた好みの推薦 ${items.length} 件 · 似た画像と探索枠（explore）を含みます`}
        </span>
        <button
          onClick={() => load(false)}
          className="px-3 py-1 text-xs glass rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
        >
          更新
        </button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        {items.map(item => (
          <RecommendCard
            key={item.image.id}
            item={item}
            reasonImages={reasonMap}
            onFeedback={handleFeedback}
            onOpen={() => modal.open(item.image.id)}
          />
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
    </div>
  )
}
