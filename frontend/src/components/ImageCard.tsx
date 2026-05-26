import { useState } from 'react'
import type { Image } from '../types'
import { ImageModal } from './ImageModal'

interface Props {
  image: Image
  onFeedback: (id: number, kind: 'like' | 'skip') => void
}

export function ImageCard({ image, onFeedback }: Props) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div className="card group relative">
        {/* サムネイル */}
        <div className="relative cursor-pointer" onClick={() => setShowModal(true)}>
          <img
            src={image.thumb_url}
            alt={image.wallhaven_id}
            className="w-full block object-cover"
            style={{ aspectRatio: '16/9' }}
            loading="lazy"
          />

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
                onClick={() => onFeedback(image.id, 'like')}
                className="px-3 py-1 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                ♥
              </button>
              <button
                onClick={() => onFeedback(image.id, 'skip')}
                className="px-3 py-1 text-sm rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
      {showModal && <ImageModal image={image} onClose={() => setShowModal(false)} />}
    </>
  )
}
