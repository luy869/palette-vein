import { useState, useEffect, useCallback } from 'react'
import type { Image, RecommendItem } from '../types'
import { fetchRecommendations } from '../api/client'
import { RecommendCard } from './RecommendCard'

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
      for (const img of data.reason_images_lookup) {
        m.set(img.id, img)
      }
      setReasonMap(m)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <p style={{ color: '#aaa' }}>読み込み中...</p>
  if (error) return <p style={{ color: '#f66' }}>{error}</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ color: '#888', fontSize: 13 }}>
          {mode === 'toplist' ? 'いいねをもっと増やすとあなた好みの推薦が始まります' : `${items.length} 件 (similar + explore)`}
        </span>
        <button
          onClick={load}
          style={{ padding: '4px 14px', background: '#3a3a3a', border: 'none', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 13 }}
        >
          更新
        </button>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
      }}>
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
