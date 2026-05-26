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
  { id: 'discover',   label: '発見' },
  { id: 'recommend',  label: 'おすすめ' },
  { id: 'search',     label: '検索' },
  { id: 'likes',      label: 'いいね' },
]

const TAB_META: Record<string, { title: string; sub: string }> = {
  discover:  { title: '発見',       sub: '未反応の画像からランダムに表示' },
  recommend: { title: 'おすすめ',   sub: 'あなたの好みをもとに推薦' },
  search:    { title: '検索',       sub: 'キーワードまたは画像で類似検索' },
  likes:     { title: 'いいね',     sub: 'いいねした画像の一覧' },
  admin:     { title: '管理',       sub: 'サービスの統計とユーザー管理' },
}

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

  useEffect(() => {
    me().then(u => setUser(u ?? false))
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  async function handleLogout() {
    await logout()
    setUser(false)
  }

  const tabs = user && user.is_admin
    ? [...BASE_TABS, { id: 'admin', label: '管理' }]
    : BASE_TABS

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

  const meta = TAB_META[tab] ?? TAB_META.discover

  return (
    <div className="min-h-screen">
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 border-b border-white/10 px-6 py-3 flex items-center" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'inherit' }}>
        {/* ロゴ */}
        <div className="flex items-center gap-2 w-40 shrink-0">
          <span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
          <span className="text-sm font-semibold tracking-wide text-slate-100">PaletteVein</span>
        </div>

        {/* タブ中央 */}
        <div className="flex-1 flex justify-center">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {/* ユーザー操作 */}
        <div className="flex items-center gap-2 w-40 shrink-0 justify-end">
          <span className="text-xs text-slate-500 truncate max-w-[80px] hidden sm:block">{user.email.split('@')[0]}</span>
          <button
            onClick={toggleTheme}
            className="px-2.5 py-1 text-xs text-slate-400 glass rounded-lg hover:text-slate-200 transition-colors"
          >
            {isDark ? 'ライト' : 'ダーク'}
          </button>
          <button
            onClick={handleLogout}
            className="px-2.5 py-1 text-xs text-slate-400 glass rounded-lg hover:text-slate-200 transition-colors"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* ページ見出し */}
      <div className="px-6 pt-7 pb-5">
        <h2 className="text-3xl font-bold text-slate-100">{meta.title}</h2>
        <p className="text-sm text-slate-500 mt-1">// {meta.sub}</p>
      </div>

      {/* コンテンツ */}
      <main className="px-6 pb-12">
        {tab === 'discover'  && <ImageGrid />}
        {tab === 'recommend' && <RecommendGrid />}
        {tab === 'search'    && <SearchGrid />}
        {tab === 'likes'     && <LikesGrid />}
        {tab === 'admin'     && <AdminDashboard />}
      </main>
    </div>
  )
}

export default App
