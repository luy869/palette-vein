import { useState, useEffect } from 'react'

interface Stats {
  total_users: number
  total_images: number
  images_with_embedding: number
  total_likes: number
  total_skips: number
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

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="glass rounded-xl p-5">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-100">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchStats(), fetchUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

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
        <StatCard label="総いいね" value={stats.total_likes} />
        <StatCard label="総スキップ" value={stats.total_skips} />
      </div>

      {/* ユーザー一覧 */}
      <div>
        <p className="text-xs text-slate-500 mb-3">{users.length} ユーザー</p>
        <div className="glass rounded-xl overflow-hidden">
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
