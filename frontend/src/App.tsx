import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import type { User } from './types'
import { me, logout } from './api/client'
import { ImageGrid } from './components/ImageGrid'
import { RecommendGrid } from './components/RecommendGrid'
import { LikesGrid } from './components/LikesGrid'
import { SearchGrid } from './components/SearchGrid'
import { AdminDashboard } from './components/AdminDashboard'
import { ProfilePalette } from './components/ProfilePalette'
import { Tabs } from './components/Tabs'
import { LoginPage } from './components/LoginPage'
import { ToastProvider } from './lib/toast'
import { ErrorBoundary } from './components/ErrorBoundary'

const BASE_TABS = [
  { id: 'discover',   label: '発見',     path: '/discover' },
  { id: 'recommend',  label: 'おすすめ', path: '/recommend' },
  { id: 'search',     label: '検索',     path: '/search' },
  { id: 'likes',      label: 'いいね',   path: '/likes' },
  { id: 'profile',    label: 'パレット', path: '/profile' },
]

const TAB_META: Record<string, { title: string; sub: string }> = {
  discover:  { title: '発見',            sub: '未反応の画像からランダムに表示' },
  recommend: { title: 'おすすめ',        sub: 'あなたの好みをもとに推薦' },
  search:    { title: '検索',            sub: 'キーワード・画像・色で類似検索' },
  likes:     { title: 'いいね',          sub: 'いいねした画像の一覧' },
  profile:   { title: 'あなたのパレット', sub: 'いいねから抽出した好みの色' },
  admin:     { title: '管理',            sub: 'サービスの統計とユーザー管理' },
}

function App() {
  const [user, setUser] = useState<User | null | false>(null)
  const [isDark, setIsDark] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

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
    navigate('/discover')
  }

  const currentTab = location.pathname.slice(1) || 'discover'
  const meta = TAB_META[currentTab] ?? TAB_META.discover

  const tabs = user && (user as User).is_admin
    ? [...BASE_TABS, { id: 'admin', label: '管理', path: '/admin' }]
    : [...BASE_TABS]

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
    <ToastProvider>
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 px-6 py-3 flex items-center" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'inherit' }}>
        <div className="flex items-center gap-2 w-40 shrink-0">
          <span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
          <span className="text-sm font-semibold tracking-wide text-slate-100">PaletteVein</span>
        </div>

        <div className="flex-1 flex justify-center">
          <Tabs tabs={tabs} />
        </div>

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

      <div className="px-6 pt-7 pb-5">
        <h2 className="text-3xl font-bold text-slate-100">{meta.title}</h2>
        <p className="text-sm text-slate-500 mt-1">// {meta.sub}</p>
      </div>

      <main className="px-6 pb-12">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/discover" replace />} />
            <Route path="/discover"  element={<ImageGrid />} />
            <Route path="/recommend" element={<RecommendGrid />} />
            <Route path="/search"    element={<SearchGrid />} />
            <Route path="/likes"     element={<LikesGrid />} />
            <Route path="/profile"   element={<ProfilePalette />} />
            {(user as User).is_admin && <Route path="/admin" element={<AdminDashboard />} />}
            <Route path="*" element={<Navigate to="/discover" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
    </ToastProvider>
  )
}

export default App
