import { useState, useEffect } from 'react'
import type { User } from './types'
import { me, logout } from './api/client'
import { ImageGrid } from './components/ImageGrid'
import { RecommendGrid } from './components/RecommendGrid'
import { LikesGrid } from './components/LikesGrid'
import { SearchGrid } from './components/SearchGrid'
import { Tabs } from './components/Tabs'
import { LoginPage } from './components/LoginPage'

const TABS = [
  { id: 'discover', label: '発見' },
  { id: 'recommend', label: 'おすすめ' },
  { id: 'search', label: '検索' },
  { id: 'likes', label: 'いいね' },
]

function App() {
  const [user, setUser] = useState<User | null | false>(null)
  const [tab, setTab] = useState('discover')

  useEffect(() => {
    me().then(u => setUser(u ?? false))
  }, [])

  async function handleLogout() {
    await logout()
    setUser(false)
  }

  if (user === null) {
    return (
      <div style={{ minHeight: '100vh', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontFamily: 'sans-serif' }}>読み込み中...</p>
      </div>
    )
  }

  if (user === false) {
    return <LoginPage onLogin={setUser} />
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', background: '#1a1a1a', minHeight: '100vh', color: '#eee' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>PaletteVein</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#888' }}>{user.email}</span>
          <button
            onClick={handleLogout}
            style={{ padding: '6px 14px', background: '#3a3a3a', border: 'none', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 13 }}
          >
            ログアウト
          </button>
        </div>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'discover' && <ImageGrid />}
      {tab === 'recommend' && <RecommendGrid />}
      {tab === 'search' && <SearchGrid />}
      {tab === 'likes' && <LikesGrid />}
    </div>
  )
}

export default App
