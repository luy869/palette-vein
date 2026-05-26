import { useState } from 'react'
import { fetchImages, fetchSearch, postFeedback } from '../api/client'
import { ImageCard } from './ImageCard'
import type { Image } from '../types'

type SearchMode = 'wallhaven' | 'clip'

export function SearchGrid() {
  const [mode, setMode] = useState<SearchMode>('clip')
  const [query, setQuery] = useState('')
  const [images, setImages] = useState<Image[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function doSearch(q: string, p: number, m: SearchMode) {
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const results = m === 'clip'
        ? await fetchSearch(q)
        : await fetchImages(p, 'relevance', q)
      setImages(results)
      setSearched(true)
    } catch (e) {
      setError(String(e))
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

  const handleFeedback = async (id: number, kind: 'like' | 'skip') => {
    try {
      await postFeedback(id, kind)
      setImages(prev => prev.filter(img => img.id !== id))
    } catch (e) {
      console.error('feedback error:', e)
    }
  }

  return (
    <div>
      {/* モード切替 */}
      <div className="flex gap-1 p-1 glass rounded-xl mb-4 w-fit">
        {(['clip', 'wallhaven'] as SearchMode[]).map(m => (
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
            {m === 'clip' ? 'CLIP（意味検索）' : 'Wallhaven（タグ）'}
          </button>
        ))}
      </div>

      {/* 検索フォーム */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={mode === 'clip' ? '例: dark forest with fog' : '例: anime sky'}
          className="flex-1 px-4 py-2 text-sm glass rounded-xl text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 py-2 text-sm font-medium rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          検索
        </button>
      </form>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading && <p className="text-slate-500 text-sm mb-4">検索中...</p>}
      {searched && !loading && images.length === 0 && (
        <p className="text-slate-600 text-sm">結果が見つかりませんでした</p>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {images.map(img => (
          <ImageCard key={img.id} image={img} onFeedback={handleFeedback} />
        ))}
      </div>

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
