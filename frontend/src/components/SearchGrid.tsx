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
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['clip', 'wallhaven'] as SearchMode[]).map(m => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              background: mode === m ? '#6c8ebf' : '#3a3a3a',
              color: mode === m ? '#fff' : '#ccc',
            }}
          >
            {m === 'clip' ? 'CLIP (意味検索)' : 'Wallhaven (タグ)'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={mode === 'clip' ? '例: dark forest with fog' : '例: anime sky'}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 4,
            border: '1px solid #444',
            background: '#2a2a2a',
            color: '#eee',
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: '8px 20px',
            borderRadius: 4,
            border: 'none',
            background: '#6c8ebf',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          検索
        </button>
      </form>

      {error && <p style={{ color: '#e88' }}>{error}</p>}
      {loading && <p style={{ color: '#aaa' }}>検索中...</p>}
      {searched && !loading && images.length === 0 && (
        <p style={{ color: '#888' }}>結果が見つかりませんでした</p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: 16,
      }}>
        {images.map(img => (
          <ImageCard key={img.id} image={img} onFeedback={handleFeedback} />
        ))}
      </div>

      {mode === 'wallhaven' && searched && images.length > 0 && (
        <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            disabled={page === 1 || loading}
            onClick={() => handlePageChange(page - 1)}
            style={{ padding: '6px 16px', cursor: 'pointer' }}
          >
            ← 前
          </button>
          <span style={{ color: '#aaa' }}>ページ {page}</span>
          <button
            disabled={loading}
            onClick={() => handlePageChange(page + 1)}
            style={{ padding: '6px 16px', cursor: 'pointer' }}
          >
            次 →
          </button>
        </div>
      )}
    </div>
  )
}
