import { useState, useEffect, useCallback } from 'react'
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

  const load = useCallback(async (more = false) => {
    if (more) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError(null)
    }
    try {
      const data = await fetchRecommendations()
      const m = new Map<number, Image>()
      for (const img of data.reason_images_lookup) m.set(img.id, img)

      if (more) {
        setDisplayedIds(prev => {
          const next = new Set(prev)
          const newItems = data.items.filter(i => !prev.has(i.image.id))
          setItems(p => [...p, ...newItems])
          newItems.forEach(i => next.add(i.image.id))
          setReasonMap(p => new Map([...p, ...m]))
          return next
        })
      } else {
        setItems(data.items)
        setMode(data.mode)
        setReasonMap(m)
        setDisplayedIds(new Set(data.items.map(i => i.image.id)))
      }
      if (!more) setMode(data.mode)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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

      {items.length > 0 && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => load(true)}
            disabled={loadingMore}
            className="px-6 py-2 text-sm glass rounded-xl text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
          >
            {loadingMore ? '読み込み中...' : 'もっと見る'}
          </button>
        </div>
      )}
    </div>
  )
}
