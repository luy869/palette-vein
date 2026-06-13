import { useEffect, useRef } from 'react'
import type { Image } from '../types'

interface Props {
  image: Image
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
  index?: number
  total?: number
}

export function ImageModal({ image, onClose, onPrev, onNext, hasPrev, hasNext, index, total }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const showNav = Boolean(onPrev || onNext)

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
      if (e.key === 'ArrowLeft' && hasPrev) {
        onPrev?.()
        return
      }
      if (e.key === 'ArrowRight' && hasNext) {
        onNext?.()
        return
      }
      // Tab フォーカスをモーダル内に閉じ込める（無効化されたボタンは除外）
      if (e.key === 'Tab' && panelRef.current) {
        const els = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
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
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  const navBtn =
    'absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-2xl ' +
    'bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors ' +
    'focus-visible:ring-2 focus-visible:ring-violet-400/60'

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
        className="glass rounded-2xl overflow-hidden max-w-5xl w-full outline-none relative"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={image.url}
          alt={`壁紙 ${image.width}×${image.height}`}
          // Wallhaven のフル画像は Referer ベースのホットリンク保護があり、
          // 他オリジンの Referer を送ると約3割が 403 になる。Referer を送らず回避する
          referrerPolicy="no-referrer"
          // それでも失敗した場合（削除済み画像など）はサムネにフォールバックし空表示を防ぐ
          onError={e => {
            if (e.currentTarget.src !== image.thumb_url) e.currentTarget.src = image.thumb_url
          }}
          className="w-full block object-contain"
          style={{ maxHeight: '80vh' }}
        />

        {showNav && (
          <>
            <button
              onClick={onPrev}
              aria-label="前の画像"
              className={`${navBtn} left-2 ${hasPrev ? '' : 'opacity-30 pointer-events-none'}`}
            >
              ‹
            </button>
            <button
              onClick={onNext}
              aria-label="次の画像"
              className={`${navBtn} right-2 ${hasNext ? '' : 'opacity-30 pointer-events-none'}`}
            >
              ›
            </button>
          </>
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-slate-500">
            {image.width}×{image.height}
            {index != null && total != null && (
              <span className="ml-2 text-slate-600">{index + 1} / {total}</span>
            )}
          </span>
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
