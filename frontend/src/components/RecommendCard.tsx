import { useState } from 'react'
import type { RecommendItem, Image } from '../types'
import { postFeedback } from '../api/client'
import { ImageModal } from './ImageModal'

interface RecommendCardProps {
  item: RecommendItem
  reasonImages: Map<number, Image>
  onFeedback: () => void
}

export function RecommendCard({ item, reasonImages, onFeedback }: RecommendCardProps) {
  const { image, source, reason_image_ids } = item
  const [showModal, setShowModal] = useState(false)

  async function handleFeedback(kind: 'like' | 'skip') {
    await postFeedback(image.id, kind)
    onFeedback()
  }

  return (
    <>
      <div className="card group relative">
        <div className="relative cursor-pointer" onClick={() => setShowModal(true)}>
          <img
            src={image.thumb_url}
            alt={image.wallhaven_id}
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
                onClick={() => handleFeedback('like')}
                className="px-3 py-1 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                ♥
              </button>
              <button
                onClick={() => handleFeedback('skip')}
                className="px-3 py-1 text-sm rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
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
                    alt={r.wallhaven_id}
                    className="w-9 h-6 object-cover rounded opacity-60 hover:opacity-100 transition-opacity"
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
      {showModal && <ImageModal image={image} onClose={() => setShowModal(false)} />}
    </>
  )
}
