import { useEffect, useRef } from 'react'
import type { Image } from '../types'

interface Props {
  image: Image
  onClose: () => void
}

export function ImageModal({ image, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 開いたらモーダルにフォーカスを移し、閉じたら元の要素に戻す
    const prevFocus = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => prevFocus?.focus()
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Tab フォーカスをモーダル内に閉じ込める
      if (e.key === 'Tab' && panelRef.current) {
        const els = panelRef.current.querySelectorAll<HTMLElement>('a[href], button')
        if (els.length === 0) return
        const first = els[0]
        const last = els[els.length - 1]
        const active = document.activeElement
        if (!panelRef.current.contains(active)) {
          e.preventDefault()
          first.focus()
        } else if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`壁紙 ${image.width}×${image.height} の拡大表示`}
        tabIndex={-1}
        className="glass rounded-2xl overflow-hidden max-w-5xl w-full outline-none"
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
            aria-label="Wallhaven で見る（新規タブで開きます）"
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/60 rounded"
            onClick={e => e.stopPropagation()}
          >
            Wallhaven で見る →
          </a>
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/60 rounded"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
