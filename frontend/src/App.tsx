import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, getCsrfCookie } from './lib/api'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
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
    navigate('/')
  }, [navigate])

  const handleLogout = useCallback(async () => {
    await getCsrfCookie()
    await api.post('/logout')
    setUser(null)
    navigate('/login')
  }, [navigate])

  if (loading) {
    return <div className="app-loading" role="status"><span className="loading-mark">T</span><span>正在连接组队大厅...</span></div>
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" onAuthenticated={handleAuthenticated} />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" onAuthenticated={handleAuthenticated} />} />
      <Route path="/" element={user ? <DashboardPage user={user} onUserUpdated={setUser} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  )
}

export default App
