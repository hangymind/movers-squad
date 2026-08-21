import { useState, type FormEvent } from 'react'
import { ArrowRight, Gamepad2, LockKeyhole } from 'lucide-react'
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
        <div className="brand-lockup"><span>Movers Squad</span></div>
        <div className="auth-brand-copy">
          <span className="eyebrow">弗洛尔雷霆找队系统</span>
          <h1>组上了，<br />再开游戏。</h1>
        </div>
        <p className="auth-footnote">更便捷的找队，不局限于Guild Chat</p>
      </aside>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="mobile-brand brand-lockup"><span>Movers Squad</span></div>
          <header><span className="eyebrow">{registering ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</span><h2>{registering ? '创建你的账户' : '登录组队大厅'}</h2><p>{registering ? '填写资料，开始寻找合适的队友。' : '输入账户信息继续。'}</p></header>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>Florr ID<span className="input-with-icon"><Gamepad2 size={18} /><input value={florrId} onChange={(event) => setFlorrId(event.target.value)} maxLength={64} autoComplete="username" placeholder="你的 Florr.io ID" required /></span></label>
            {registering && <label>Florr 等级<span className="input-with-icon"><Gamepad2 size={18} /><input type="number" min={1} max={1000} value={level} onChange={(event) => setLevel(event.target.value)} required /></span></label>}
            <label>密码<span className="input-with-icon"><LockKeyhole size={18} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} autoComplete={registering ? 'new-password' : 'current-password'} placeholder="至少 8 个字符" required /></span></label>
            {registering && <>
              <label>确认密码<span className="input-with-icon"><LockKeyhole size={18} /><input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={8} maxLength={72} autoComplete="new-password" placeholder="再次输入密码" required /></span></label>
            </>}
            <button className="button-primary auth-submit" type="submit" disabled={submitting}>{submitting ? '请稍候...' : registering ? '创建账户' : '登录'}<ArrowRight size={18} /></button>
          </form>
          <p className="auth-switch">{registering ? '已有账户？' : '还没有账户？'}<Link to={registering ? '/login' : '/register'}>{registering ? '直接登录' : '立即注册'}</Link></p>
        </div>
        <footer className="site-footer">©Movers 2026</footer>
      </section>
      <ErrorDialog message={error} onClose={() => setError('')} />
    </main>
  )
}
