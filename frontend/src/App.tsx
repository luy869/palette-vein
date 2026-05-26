import { useState, useEffect } from 'react'
import type { User } from './types'
import { me, logout } from './api/client'
import { ImageGrid } from './components/ImageGrid'
import { RecommendGrid } from './components/RecommendGrid'
import { LikesGrid } from './components/LikesGrid'
import { SearchGrid } from './components/SearchGrid'
import { AdminDashboard } from './components/AdminDashboard'
import { Tabs } from './components/Tabs'
import { LoginPage } from './components/LoginPage'

const BASE_TABS = [
  { id: 'discover', label: '発見' },
  { id: 'recommend', label: 'おすすめ' },
  { id: 'search', label: '検索' },
  { id: 'likes', label: 'いいね' },
]

function App() {
  const [user, setUser] = useState<User | null | false>(null)
  const [tab, setTab] = useState('discover')
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('theme') ?? 'dark'
    const dark = saved === 'dark'
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const tabs = user && user !== false && user.is_admin
    ? [...BASE_TABS, { id: 'admin', label: '管理' }]
    : BASE_TABS

  useEffect(() => {
    me().then(u => setUser(u ?? false))
  }, [])

  async function handleLogout() {
    await logout()
    setUser(false)
  }

  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (user === false) {
    return <LoginPage onLogin={setUser} />
  }

  return (
    <div className="min-h-screen px-6 py-5">
      {/* ヘッダー */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
          <h1 className="text-xl font-semibold tracking-wide text-slate-100">PaletteVein</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{user.email}</span>
          <button
            onClick={toggleTheme}
            className="px-3 py-1.5 text-xs text-slate-400 glass rounded-md hover:text-slate-200 transition-colors"
          >
            {isDark ? 'ライト' : 'ダーク'}
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs text-slate-400 glass rounded-md hover:text-slate-200 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </header>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'discover' && <ImageGrid />}
      {tab === 'recommend' && <RecommendGrid />}
      {tab === 'search' && <SearchGrid />}
      {tab === 'likes' && <LikesGrid />}
      {tab === 'admin' && <AdminDashboard />}
    </div>
  )
}

export default App
