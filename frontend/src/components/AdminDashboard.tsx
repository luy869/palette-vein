import { useState, useEffect } from 'react'
import { useToast } from '../lib/toast'

interface Stats {
  total_users: number
  total_images: number
  images_with_embedding: number
  total_likes: number
  total_skips: number
  embedder_queue: number
}

interface AdminUser {
  id: number
  email: string
  is_admin: boolean
  created_at: string
  likes: number
  skips: number
}

async function fetchStats(): Promise<Stats> {
  const res = await fetch('/api/admin/stats', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.users
}

async function triggerCrawl(query: string, pages: number): Promise<void> {
  const res = await fetch('/api/admin/crawl', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, pages }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.trim() || `HTTP ${res.status}`)
  }
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="glass rounded-xl p-5">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-100">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

export function AdminDashboard() {
  const { push: toast } = useToast()
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [crawlQuery, setCrawlQuery] = useState('')
  const [crawlPages, setCrawlPages] = useState(3)
  const [crawling, setCrawling] = useState(false)

  useEffect(() => {
    Promise.all([fetchStats(), fetchUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleCrawl(e: React.FormEvent) {
    e.preventDefault()
    if (!crawlQuery.trim()) return
    setCrawling(true)
    try {
      await triggerCrawl(crawlQuery.trim(), crawlPages)
      toast(`クロール開始: "${crawlQuery}" ${crawlPages}ページ`, 'success')
      setCrawlQuery('')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setCrawling(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">読み込み中...</p>
  if (error) return <p className="text-red-400 text-sm">{error}</p>
  if (!stats) return null

  return (
    <div className="space-y-8">
      {/* 統計カード */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <StatCard label="ユーザー数" value={stats.total_users} />
        <StatCard label="画像数" value={stats.total_images} />
        <StatCard
          label="埋め込み済み"
          value={stats.images_with_embedding}
          sub={`${Math.round(stats.images_with_embedding / Math.max(stats.total_images, 1) * 100)}%`}
        />
        <StatCard label="埋め込み待ち" value={stats.embedder_queue} />
        <StatCard label="総いいね" value={stats.total_likes} />
        <StatCard label="総スキップ" value={stats.total_skips} />
      </div>

      {/* クロールトリガー */}
      <div>
        <p className="text-xs text-slate-500 mb-3">クロール実行</p>
        <form onSubmit={handleCrawl} className="flex gap-2 items-center">
          <input
            type="text"
            value={crawlQuery}
            onChange={e => setCrawlQuery(e.target.value)}
            placeholder="例: anime landscape"
            className="flex-1 px-4 py-2 text-sm glass rounded-xl text-slate-200 placeholder-slate-600 outline-none max-w-xs"
          />
          <input
            type="number"
            value={crawlPages}
            onChange={e => setCrawlPages(Math.max(1, Math.min(20, Number(e.target.value))))}
            className="w-20 px-3 py-2 text-sm glass rounded-xl text-slate-200 outline-none text-center"
            min={1}
            max={20}
          />
          <span className="text-xs text-slate-600">ページ</span>
          <button
            type="submit"
            disabled={crawling || !crawlQuery.trim()}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-colors"
          >
            {crawling ? '送信中...' : '開始'}
          </button>
        </form>
      </div>

      {/* ユーザー一覧 */}
      <div>
        <p className="text-xs text-slate-500 mb-3">{users.length} ユーザー</p>
        <div className="glass rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">メール</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">いいね</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">スキップ</th>
                <th className="text-right px-4 py-3 text-xs text-slate-500 font-medium">登録日</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-slate-300">
                    {u.email}
                    {u.is_admin && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-600/30 text-violet-400">
                        admin
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">{u.likes}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{u.skips}</td>
                  <td className="px-4 py-3 text-right text-slate-600 text-xs">
                    {new Date(u.created_at).toLocaleDateString('ja-JP')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
