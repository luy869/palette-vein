import type { Image } from '../types'

interface Props {
  image: Image
  onFeedback: (id: number, kind: 'like' | 'skip') => void
}

export function ImageCard({ image, onFeedback }: Props) {
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-slate-500">{image.width}×{image.height}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onFeedback(image.id, 'like')}
            className="px-4 py-1 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors duration-150"
          >
            ♥
          </button>
          <button
            onClick={() => onFeedback(image.id, 'skip')}
            className="px-4 py-1 text-sm rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors duration-150"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
