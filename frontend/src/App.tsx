import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, getCsrfCookie } from './lib/api'
import { AuthPage } from './pages/AuthPage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminPage } from './pages/AdminPage'
import { BannedPage } from './pages/BannedPage'
import { FlorrBindingPage } from './pages/FlorrBindingPage'
import { AppLoading } from './components/AppLoading'
import { BuildLabel } from './components/BuildLabel'
import type { User } from './types'
import './App.css'

const TeamRoomPage = lazy(() => import('./pages/TeamRoomPage').then((module) => ({ default: module.TeamRoomPage })))

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
    return <><AppLoading /><BuildLabel /></>
  }

  return (<>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.isBanned ? '/banned' : '/'} replace /> : <AuthPage mode="login" onAuthenticated={handleAuthenticated} />} />
      <Route path="/register" element={user ? <Navigate to={user.isBanned ? '/banned' : '/'} replace /> : <AuthPage mode="register" onAuthenticated={handleAuthenticated} />} />
      <Route path="/banned" element={user?.isBanned ? <BannedPage user={user} /> : <Navigate to={user ? '/' : '/login'} replace />} />
      <Route path="/admin" element={user?.isAdmin && !user.isBanned ? <AdminPage /> : <Navigate to={user?.isBanned ? '/banned' : user ? '/' : '/login'} replace />} />
      <Route path="/bind-florr" element={user && !user.isBanned ? user.florrBinding?.resultUnread ? <Navigate to="/" replace /> : <FlorrBindingPage user={user} onUserUpdated={setUser} /> : <Navigate to={user?.isBanned ? '/banned' : '/login'} replace />} />
      <Route path="/teams/:teamId/room" element={user && !user.isBanned ? <Suspense fallback={<AppLoading />}><TeamRoomPage user={user} onLogout={handleLogout} /></Suspense> : <Navigate to={user?.isBanned ? '/banned' : '/login'} replace />} />
      <Route path="/" element={user ? user.isBanned ? <Navigate to="/banned" replace /> : <DashboardPage user={user} onUserUpdated={setUser} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
    <BuildLabel />
  </>)
}

export default App
