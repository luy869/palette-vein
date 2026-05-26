import type { RecommendItem, Image } from '../types'
import { postFeedback } from '../api/client'

interface RecommendCardProps {
  item: RecommendItem
  reasonImages: Map<number, Image>
  onFeedback: () => void
}

export function RecommendCard({ item, reasonImages, onFeedback }: RecommendCardProps) {
  const { image, source, reason_image_ids } = item

  async function handleFeedback(kind: 'like' | 'skip') {
    await postFeedback(image.id, kind)
    onFeedback()
  }

  return (
    <div className="glass glass-hover rounded-xl overflow-hidden group">
      <div className="relative">
        <img
          src={image.thumb_url}
          alt={image.wallhaven_id}
          className="w-full block object-cover"
          style={{ aspectRatio: '16/9' }}
          loading="lazy"
        />
        {source === 'explore' && (
          <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-slate-400 border border-white/10">
            explore
          </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {source === 'similar' && reason_image_ids.length > 0 && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <span className="text-[10px] text-slate-600 shrink-0">because</span>
          <div className="flex gap-1">
            {reason_image_ids.map(rid => {
              const r = reasonImages.get(rid)
              if (!r) return null
              return (
                <img
                  key={rid}
                  src={r.thumb_url}
                  alt={r.wallhaven_id}
                  className="w-9 h-6 object-cover rounded opacity-70 hover:opacity-100 transition-opacity"
                />
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 p-3">
        <button
          onClick={() => handleFeedback('like')}
          className="flex-1 py-1.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors duration-150"
        >
          ♥
        </button>
        <button
          onClick={() => handleFeedback('skip')}
          className="flex-1 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors duration-150"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
