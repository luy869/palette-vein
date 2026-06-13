import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchImages, fetchSearch, postFeedback, deleteFeedback, searchByImage, searchByColor } from '../api/client'
import { ImageCard } from './ImageCard'
import { SkeletonGrid } from './SkeletonCard'
import { ColorPicker } from './ColorPicker'
import { useToast } from '../lib/toast'
import { GRID_COLUMNS } from '../lib/grid'
import type { Image } from '../types'

type SearchMode = 'wallhaven' | 'clip' | 'color'

export function SearchGrid() {
  const { push: toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<SearchMode>('clip')
  const [query, setQuery] = useState('')
  const [colorHex, setColorHex] = useState('#6644cc')
  const [images, setImages] = useState<Image[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // hex クエリパラメータがあれば色検索モードで自動実行。
  // KeepAlive でマウントされ続けるため、hex 変化のたびに再実行する
  // （パレットの色を続けてクリックしても毎回反映される）。
  const hexParam = searchParams.get('hex')
  useEffect(() => {
    if (!hexParam) return
    const normalized = hexParam.startsWith('#') ? hexParam : `#${hexParam}`
    setMode('color')
    setColorHex(normalized)
    doColorSearch(normalized)
    setSearchParams({}, { replace: true })
  }, [hexParam]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doSearch(q: string, p: number, m: SearchMode) {
    if (!q.trim()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const results = m === 'clip'
        ? await fetchSearch(q, controller.signal)
        : await fetchImages(p, 'relevance', q, controller.signal)
      setImages(results)
      setSearched(true)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function doColorSearch(hex: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const results = await searchByColor(hex, controller.signal)
      setImages(results)
      setSearched(true)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(String(e))
      toast('色検索に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function doImageSearch(file: File) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setQuery('')
    try {
      const results = await searchByImage(file, controller.signal)
      setImages(results)
      setSearched(true)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(String(e))
      toast('画像検索に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    doSearch(query, 1, mode)
  }

  function handlePageChange(next: number) {
    setPage(next)
    doSearch(query, next, mode)
  }

  function handleModeChange(m: SearchMode) {
    setMode(m)
    setImages([])
    setSearched(false)
    setPage(1)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) doImageSearch(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) doImageSearch(file)
    e.target.value = ''
  }

  const handleFeedback = (id: number, kind: 'like' | 'skip') => {
    const idx = images.findIndex(img => img.id === id)
    const removed = images[idx]
    if (!removed) return

    // 楽観的に即削除
    setImages(prev => prev.filter(img => img.id !== id))

    postFeedback(id, kind)
      .then(() => {
        toast(kind === 'like' ? 'いいねしました' : 'スキップしました', 'success', {
          label: '取り消す',
          onClick: () => {
            deleteFeedback(id, kind).catch(() => toast('取り消しに失敗しました', 'error'))
            setImages(prev => {
              if (prev.some(img => img.id === id)) return prev
              const next = [...prev]
              next.splice(Math.min(idx, next.length), 0, removed)
              return next
            })
          },
        })
      })
      .catch(() => {
        toast('フィードバックの送信に失敗しました', 'error')
        setImages(prev => {
          if (prev.some(img => img.id === id)) return prev
          const next = [...prev]
          next.splice(Math.min(idx, next.length), 0, removed)
          return next
        })
      })
  }

  const modeLabels: Record<SearchMode, string> = {
    clip: 'CLIP（意味検索）',
    wallhaven: 'Wallhaven（タグ）',
    color: '色で検索',
  }

  return (
    <div>
      {/* モード切替 */}
      <div className="flex gap-1 p-1 glass rounded-xl mb-4 w-fit">
        {(['clip', 'wallhaven', 'color'] as SearchMode[]).map(m => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={[
              'px-4 py-1.5 rounded-lg text-sm transition-all duration-200',
              mode === m
                ? 'bg-violet-600 text-white shadow-[0_0_12px_rgba(124,106,245,0.4)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
            ].join(' ')}
          >
            {modeLabels[m]}
          </button>
        ))}
      </div>

      {/* 色検索UI */}
      {mode === 'color' && (
        <div className="flex items-center gap-4 mb-6">
          <ColorPicker value={colorHex} onChange={setColorHex} />
          <button
            onClick={() => doColorSearch(colorHex)}
            disabled={loading}
            className="px-5 py-2 text-sm font-medium rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-colors"
          >
            検索
          </button>
        </div>
      )}

      {/* テキスト検索フォーム */}
      {mode !== 'color' && (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={mode === 'clip' ? '例: 夜の森 / dark fantasy castle / anime girl with sword' : '例: anime sky'}
            className="flex-1 px-4 py-2 text-sm glass rounded-xl text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2 text-sm font-medium rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            検索
          </button>
        </form>
      )}

      {mode === 'clip' && !searched && (
        <p className="text-xs text-slate-600 mb-4">
          画像の雰囲気・色調・シーンを自由な言葉で入力してください。日本語・英語どちらでも使えます。
        </p>
      )}

      {/* 画像ドロップゾーン（CLIPモードのみ） */}
      {mode === 'clip' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'mb-6 flex items-center justify-center rounded-xl border border-dashed cursor-pointer transition-colors py-4',
            dragging
              ? 'border-violet-400 bg-violet-500/10 text-violet-300'
              : 'border-white/15 text-slate-600 hover:border-white/30 hover:text-slate-500',
          ].join(' ')}
        >
          <p className="text-sm">画像をドロップ、またはクリックして類似検索</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {searched && !loading && images.length === 0 && (
        <p className="text-slate-600 text-sm">結果が見つかりませんでした</p>
      )}

      {loading
        ? <SkeletonGrid count={8} columns={GRID_COLUMNS} />
        : (
          <div className="grid gap-4" style={{ gridTemplateColumns: GRID_COLUMNS }}>
            {images.map(img => (
              <ImageCard key={img.id} image={img} onFeedback={handleFeedback} />
            ))}
          </div>
        )
      }

      {mode === 'wallhaven' && searched && images.length > 0 && (
        <div className="flex items-center gap-3 mt-8">
          <button
            disabled={page === 1 || loading}
            onClick={() => handlePageChange(page - 1)}
            className="px-4 py-1.5 text-sm glass rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← 前
          </button>
          <span className="text-slate-500 text-sm">ページ {page}</span>
          <button
            disabled={loading}
            onClick={() => handlePageChange(page + 1)}
            className="px-4 py-1.5 text-sm glass rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            次 →
          </button>
        </div>
      )}
    </div>
  )
}
