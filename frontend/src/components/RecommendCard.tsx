import { useState, useRef, useEffect } from 'react'
import type { RecommendItem, Image } from '../types'

interface RecommendCardProps {
  item: RecommendItem
  reasonImages: Map<number, Image>
  onFeedback: (id: number, kind: 'like' | 'skip') => void
  onOpen: () => void
}

export function RecommendCard({ item, reasonImages, onFeedback, onOpen }: RecommendCardProps) {
  const { image, source, reason_image_ids } = item
  const [leaving, setLeaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function handleFeedbackClick(kind: 'like' | 'skip') {
    if (leaving) return
    setLeaving(true)
    timerRef.current = setTimeout(() => onFeedback(image.id, kind), 200)
  }

  return (
    <div className={`card group relative transition-all duration-200 ${leaving ? 'opacity-0 scale-90' : ''}`}>
      <div className="relative cursor-pointer" onClick={onOpen}>
          <img
            src={image.thumb_url}
            alt={`壁紙 ${image.width}×${image.height}`}
            referrerPolicy="no-referrer"
            className="w-full block object-cover"
            style={{ aspectRatio: '16/9' }}
            loading="lazy"
          />

          {/* explore バッジ */}
          {source === 'explore' && (
            <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white/70 border border-white/20">
              explore
            </span>
          )}

          {/* 解像度チップ */}
          <span className="absolute bottom-2 left-2 text-[11px] px-2 py-0.5 rounded-full bg-black/50 text-white/80 select-none">
            {image.width}×{image.height}
          </span>

          {/* ホバーオーバーレイ */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <a
              href={`https://wallhaven.cc/w/${image.wallhaven_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 text-xs hover:text-white transition-colors"
              onClick={e => e.stopPropagation()}
            >
              ↗ Wallhaven
            </a>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => handleFeedbackClick('like')}
                disabled={leaving}
                className="px-3 py-1 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ♥
              </button>
              <button
                onClick={() => handleFeedbackClick('skip')}
                disabled={leaving}
                className="px-3 py-1 text-sm rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* because サムネイル */}
        {source === 'similar' && reason_image_ids.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] text-slate-500 shrink-0">because</span>
            <div className="flex gap-1">
              {reason_image_ids.map(rid => {
                const r = reasonImages.get(rid)
                if (!r) return null
                return (
                  <img
                    key={rid}
                    src={r.thumb_url}
                    alt="推薦理由の画像"
                    referrerPolicy="no-referrer"
                    className="w-9 h-6 object-cover rounded opacity-60 hover:opacity-100 transition-opacity"
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
  )
}
