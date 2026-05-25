import { useState } from 'react'
import { ImageGrid } from './components/ImageGrid'
import { RecommendGrid } from './components/RecommendGrid'
import { LikesGrid } from './components/LikesGrid'
import { Tabs } from './components/Tabs'

const TABS = [
  { id: 'discover', label: '発見' },
  { id: 'recommend', label: 'おすすめ' },
  { id: 'likes', label: 'いいね' },
]

function App() {
  const [tab, setTab] = useState('discover')

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', background: '#1a1a1a', minHeight: '100vh', color: '#eee' }}>
      <h1 style={{ marginBottom: 20, fontSize: 28 }}>PaletteVein</h1>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'discover' && <ImageGrid />}
      {tab === 'recommend' && <RecommendGrid />}
      {tab === 'likes' && <LikesGrid />}
    </div>
  )
}

export default App
