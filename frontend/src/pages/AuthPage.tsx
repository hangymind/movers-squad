import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, getCsrfCookie, getErrorMessage } from '../lib/api'
import type { User } from '../types'
import { ErrorDialog } from '../components/ErrorDialog'

interface AuthPageProps { mode: 'login' | 'register'; onAuthenticated: (user: User) => void }

export function AuthPage({ mode, onAuthenticated }: AuthPageProps) {
  const registering = mode === 'register'
  const [florrId, setFlorrId] = useState('')
  const [level, setLevel] = useState('1')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await getCsrfCookie()
      const payload = registering
        ? { florrId, level: Number(level), password, password_confirmation: passwordConfirmation }
        : { florrId, password }
      const { data } = await api.post<{ data: User }>(registering ? '/register' : '/login', payload)
      onAuthenticated(data.data)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <aside className="auth-brand">
        <div className="brand-lockup"><span>Movers Squad</span><small>伐木.io</small></div>
        <div className="auth-brand-copy">
          <h1>MOV组队大厅</h1>
          <p>发布招募，人齐了再开游戏</p>
        </div>
        <div className="auth-lobby-note">
          <span>©Movers 2026</span>
          <div className="auth-seat-row" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      </aside>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          
          <header><h2>{registering ? '创建账户' : '欢迎后背'}</h2><p>{registering ? '使用 Florr ID 登入' : '登录后继续查看队伍和招募。'}</p></header>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>Florr ID<input value={florrId} onChange={(event) => setFlorrId(event.target.value)} maxLength={64} autoComplete="username" placeholder="输入你的 Florr.io ID" required /></label>
            {registering && <label>Florr 等级<input type="number" min={1} max={1000} value={level} onChange={(event) => setLevel(event.target.value)} required /></label>}
            <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} autoComplete={registering ? 'new-password' : 'current-password'} placeholder="至少 8 个字符" required /></label>
            {registering && <>
              <label>确认密码<input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={8} maxLength={72} autoComplete="new-password" placeholder="再次输入密码" required /></label>
            </>}
            <button className="button-primary auth-submit" type="submit" disabled={submitting}>{submitting ? '请稍候...' : registering ? '创建账户' : '登录'}<ArrowRight size={18} /></button>
          </form>
          <p className="auth-switch">{registering ? '已有账户？' : '还没有账户？'}<Link to={registering ? '/login' : '/register'}>{registering ? '直接登录' : '创建账户'}</Link></p>
        </div>
        
      </section>
      <ErrorDialog message={error} onClose={() => setError('')} />
    </main>
  )
}
