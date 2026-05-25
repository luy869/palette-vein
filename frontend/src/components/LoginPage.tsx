import { useState } from 'react'
import type { User } from '../types'
import { login, register } from '../api/client'

interface LoginPageProps {
  onLogin: (user: User) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = mode === 'login'
        ? await login(email, password)
        : await register(email, password)
      onLogin(user)
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#eee',
    fontSize: 14,
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#1a1a1a', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif',
    }}>
      <div style={{ width: 360, padding: 32, background: '#242424', borderRadius: 12 }}>
        <h1 style={{ margin: '0 0 24px', fontSize: 22, color: '#eee', textAlign: 'center' }}>
          PaletteVein
        </h1>

        <div style={{ display: 'flex', marginBottom: 24, background: '#1a1a1a', borderRadius: 8, padding: 4 }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: 6, cursor: 'pointer',
                background: mode === m ? '#7c6af5' : 'transparent',
                color: '#eee', fontSize: 13,
              }}
            >
              {m === 'login' ? 'ログイン' : '新規登録'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder={mode === 'register' ? 'パスワード（8文字以上）' : 'パスワード'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          {error && <p style={{ color: '#f77', fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 0', background: '#7c6af5', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 14, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1, marginTop: 4,
            }}
          >
            {loading ? '...' : mode === 'login' ? 'ログイン' : '登録'}
          </button>
        </form>
      </div>
    </div>
  )
}
