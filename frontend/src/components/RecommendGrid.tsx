import { useState, useEffect, useCallback, useRef } from 'react'
import type { Image, RecommendItem } from '../types'
import { fetchRecommendations } from '../api/client'
import { RecommendCard } from './RecommendCard'
import { SkeletonGrid } from './SkeletonCard'

export function RecommendGrid() {
  const [items, setItems] = useState<RecommendItem[]>([])
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

  if (loading) return <SkeletonGrid count={8} columns="repeat(auto-fill, minmax(260px, 1fr))" />
  if (error) return <p className="text-red-400 text-sm">{error}</p>

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs text-slate-600">
          {mode === 'toplist'
            ? 'いいねをもっと増やすとあなた好みの推薦が始まります'
            : `${items.length} 件 (similar + explore)`}
        </span>
        <button
          onClick={() => load(false)}
          className="px-3 py-1 text-xs glass rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
        >
          更新
        </button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {items.map(item => (
          <RecommendCard
            key={item.image.id}
            item={item}
            reasonImages={reasonMap}
            onFeedback={() => load(false)}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="h-4 mt-4" />
      {loadingMore && <p className="text-slate-500 text-sm text-center mt-2">読み込み中...</p>}
    </div>
  )
}
