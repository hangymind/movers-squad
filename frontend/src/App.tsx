import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, getCsrfCookie } from './lib/api'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminPage } from './pages/AdminPage'
import { BannedPage } from './pages/BannedPage'
import type { User } from './types'
import './App.css'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get<{ data: User }>('/user')
      .then(({ data }) => setUser(data.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const handleAuthenticated = useCallback((nextUser: User) => {
    setUser(nextUser)
    navigate(nextUser.isBanned ? '/banned' : '/')
  }, [navigate])

  const handleLogout = useCallback(async () => {
    await getCsrfCookie()
    await api.post('/logout')
    setUser(null)
    navigate('/login')
  }, [navigate])

  if (loading) {
    return <div className="app-loading" role="status"><span className="loading-mark">NAIDA</span><span>正在连接Websocket...</span></div>
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.isBanned ? '/banned' : '/'} replace /> : <AuthPage mode="login" onAuthenticated={handleAuthenticated} />} />
      <Route path="/register" element={user ? <Navigate to={user.isBanned ? '/banned' : '/'} replace /> : <AuthPage mode="register" onAuthenticated={handleAuthenticated} />} />
      <Route path="/banned" element={user?.isBanned ? <BannedPage user={user} /> : <Navigate to={user ? '/' : '/login'} replace />} />
      <Route path="/admin" element={user?.isAdmin && !user.isBanned ? <AdminPage /> : <Navigate to={user?.isBanned ? '/banned' : user ? '/' : '/login'} replace />} />
      <Route path="/" element={user ? user.isBanned ? <Navigate to="/banned" replace /> : <DashboardPage user={user} onUserUpdated={setUser} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  )
}

export default App
