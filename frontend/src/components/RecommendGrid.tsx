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
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchRecommendations()
      setItems(data.items)
      setMode(data.mode)
      const m = new Map<number, Image>()
      for (const img of data.reason_images_lookup) m.set(img.id, img)
      setReasonMap(m)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
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
          onClick={load}
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
            onFeedback={load}
          />
        ))}
      </div>
    </div>
  )
}
