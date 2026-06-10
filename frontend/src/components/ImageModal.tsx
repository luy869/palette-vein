import { useEffect } from 'react'
import type { Image } from '../types'

interface Props {
  image: Image
  onClose: () => void
}

export function ImageModal({ image, onClose }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl overflow-hidden max-w-5xl w-full"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={image.url}
          alt={`壁紙 ${image.width}×${image.height}`}
          className="w-full block object-contain"
          style={{ maxHeight: '80vh' }}
        />
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-slate-500">{image.width}×{image.height}</span>
          <a
            href={`https://wallhaven.cc/w/${image.wallhaven_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            Wallhaven で見る →
          </a>
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
