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

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a14' }}>
      <div className="w-80 glass rounded-2xl p-8">
        {/* ロゴ */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
          <h1 className="text-lg font-semibold tracking-wide text-slate-100">PaletteVein</h1>
        </div>

        {/* モード切替 */}
        <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              className={[
                'flex-1 py-1.5 rounded-lg text-sm transition-all duration-200',
                mode === m
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              {m === 'login' ? 'ログイン' : '新規登録'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500 transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          />
          <input
            type="password"
            placeholder={mode === 'register' ? 'パスワード（8文字以上）' : 'パスワード'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 text-sm rounded-xl text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500 transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-1 text-sm font-medium rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '...' : mode === 'login' ? 'ログイン' : '登録'}
          </button>
        </form>
      </div>
    </div>
  )
}
