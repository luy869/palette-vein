import { useEffect, useState } from 'react'

interface ColorEntry {
  hex: string
  count: number
}

interface PaletteData {
  palette: ColorEntry[]
  total_likes: number
}

async function fetchPalette(): Promise<PaletteData> {
  const res = await fetch('/api/profile/palette', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function ProfilePalette() {
  const [data, setData] = useState<PaletteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPalette()
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-slate-500 text-sm">読み込み中...</p>
  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (!data || data.palette.length === 0) {
    return <p className="text-slate-600 text-sm">いいねを増やすと好みの色が表示されます</p>
  }

  const maxCount = data.palette[0].count

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-slate-500 mb-1">いいね画像から抽出</p>
        <p className="text-xs text-slate-600">集計対象: 最新 {data.total_likes} 件</p>
      </div>

      {/* カラードット */}
      <div className="flex flex-wrap gap-3 items-end">
        {data.palette.map(entry => {
          const size = 24 + Math.round((entry.count / maxCount) * 48)
          return (
            <div key={entry.hex} className="flex flex-col items-center gap-1.5">
              <div
                title={`${entry.hex} (${entry.count})`}
                className="rounded-full shadow-lg"
                style={{
                  backgroundColor: entry.hex,
                  width: size,
                  height: size,
                  boxShadow: `0 0 ${size / 2}px ${entry.hex}66`,
                }}
              />
              <span className="text-[10px] text-slate-600">{entry.hex}</span>
            </div>
          )
        })}
      </div>

      {/* カラーバー */}
      <div className="space-y-2">
        {data.palette.map(entry => (
          <div key={entry.hex} className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-sm shrink-0"
              style={{ backgroundColor: entry.hex }}
            />
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(entry.count / maxCount) * 100}%`,
                  backgroundColor: entry.hex,
                }}
              />
            </div>
            <span className="text-xs text-slate-500 w-8 text-right">{entry.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
