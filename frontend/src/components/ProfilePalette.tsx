import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchProfileTags } from '../api/client'
import type { ProfileTagsResponse } from '../types'

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
  const navigate = useNavigate()
  const [data, setData] = useState<PaletteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tags, setTags] = useState<ProfileTagsResponse | null>(null)

  useEffect(() => {
    fetchPalette()
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
    fetchProfileTags()
      .then(setTags)
      .catch(() => { /* タグ取得失敗は非致命的 */ })
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

      {/* 概念タグ */}
      {tags && !tags.cold_start && !tags.warming_up && tags.tags.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-3">あなたの好みのキーワード</p>
          <div className="flex flex-wrap gap-2">
            {tags.tags.map(tag => (
              <button
                key={tag.en}
                title={`"${tag.en}" でCLIP検索`}
                onClick={() => navigate(`/search?q=${encodeURIComponent(tag.en)}`)}
                className="px-2.5 py-1 rounded-full text-xs border border-white/20 bg-black/40 text-slate-200 hover:bg-violet-600/40 hover:border-violet-400/60 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-violet-400/60 focus:outline-none"
                style={{ opacity: 0.5 + tag.weight * 0.5 }}
              >
                {tag.ja}
              </button>
            ))}
          </div>

          {/* 系統別（複数系統ある場合のみ） */}
          {tags.clusters.length > 1 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-500">好みは {tags.clusters.length} 系統に分かれています</p>
              {tags.clusters.map((cl, i) => (
                <div key={i}>
                  <p className="text-[10px] text-slate-600 mb-1.5">
                    系統 {i + 1}（{Math.round(cl.share * 100)}%）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cl.tags.map(tag => (
                      <button
                        key={tag.en}
                        title={`"${tag.en}" でCLIP検索`}
                        onClick={() => navigate(`/search?q=${encodeURIComponent(tag.en)}`)}
                        className="px-2 py-0.5 rounded-full text-[10px] border border-white/15 bg-black/30 text-slate-300 hover:bg-violet-600/30 hover:border-violet-400/50 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-violet-400/60 focus:outline-none"
                        style={{ opacity: 0.5 + tag.weight * 0.5 }}
                      >
                        {tag.ja}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tags?.warming_up && (
        <p className="text-xs text-slate-600">概念タグを準備中… (CLIPモデルのロード完了後に表示されます)</p>
      )}
      {tags?.cold_start && (
        <p className="text-xs text-slate-600">いいねが10件たまると、好みを言葉で表示します</p>
      )}

      {/* カラードット */}
      <div className="flex flex-wrap gap-3 items-end">
        {data.palette.map(entry => {
          const size = 24 + Math.round((entry.count / maxCount) * 48)
          return (
            <div key={entry.hex} className="flex flex-col items-center gap-1.5">
              <button
                title={`${entry.hex} (${entry.count}) — クリックで色検索`}
                onClick={() => navigate(`/search?hex=${encodeURIComponent(entry.hex)}`)}
                className="rounded-full shadow-lg cursor-pointer hover:scale-110 transition-transform focus-visible:ring-2 focus-visible:ring-violet-400/60 focus:outline-none"
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
