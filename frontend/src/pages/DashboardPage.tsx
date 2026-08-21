import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, ChevronDown, Gamepad2, LogOut, Plus, RefreshCw, ShieldCheck, UsersRound, UserCog } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { CreateTeamForm } from '../components/CreateTeamForm'
import { TeamCard } from '../components/TeamCard'
import { ProfileSettings } from '../components/ProfileSettings'
import { api, getErrorMessage } from '../lib/api'
import { createEcho } from '../lib/echo'
import { showJoinNotification } from '../lib/notifications'
import type { Team, TeamMemberJoinedEvent, User } from '../types'
import { ErrorDialog } from '../components/ErrorDialog'

interface DashboardPageProps { user: User; onUserUpdated: (user: User) => void; onLogout: () => Promise<void> }
type NotificationState = 'unsupported' | NotificationPermission

export function DashboardPage({ user, onUserUpdated, onLogout }: DashboardPageProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busyTeamId, setBusyTeamId] = useState<number | null>(null)
  const [notificationState, setNotificationState] = useState<NotificationState>('Notification' in window ? Notification.permission : 'unsupported')
  const [profileOpen, setProfileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    if (!userMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setUserMenuOpen(false) }
    const closeOnOutsideClick = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.user-menu-wrap')) setUserMenuOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => { document.removeEventListener('keydown', closeOnEscape); document.removeEventListener('mousedown', closeOnOutsideClick) }
  }, [userMenuOpen])

  const loadTeams = useCallback(async (silent = false) => {
    await Promise.resolve()
    if (!silent) setLoading(true)
    setError('')
    try {
      const { data } = await api.get<{ data: Team[] }>('/teams')
      setTeams(data.data)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Loading remote team state is the synchronization this effect owns.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadTeams() }, [loadTeams])

  const subscribedTeamIds = useMemo(
    () => teams.filter((team) => team.members.some((member) => member.id === user.id)).map((team) => team.id).sort((a, b) => a - b),
    [teams, user.id],
  )
  const subscriptionKey = subscribedTeamIds.join(',')

  useEffect(() => {
    const echo = createEcho()
    subscribedTeamIds.forEach((teamId) => {
      echo.private(`team.${teamId}`).listen('.TeamMemberJoined', (event: TeamMemberJoinedEvent) => {
        if (event.joinedUser.id === user.id) return
        showJoinNotification(event, user.id)
        void loadTeams(true)
      })
    })

    return () => {
      subscribedTeamIds.forEach((teamId) => echo.leave(`team.${teamId}`))
      echo.disconnect()
    }
    // subscriptionKey is the stable representation of the subscribed list.
  }, [subscriptionKey, user.id, loadTeams]) // eslint-disable-line react-hooks/exhaustive-deps

  const enableNotifications = async () => {
    if (!('Notification' in window)) return
    setNotificationState(await Notification.requestPermission())
  }

  const handleAction = async (team: Team, action: 'join' | 'leave' | 'close') => {
    setBusyTeamId(team.id)
    setError('')
    try {
      if (action === 'join') await api.post(`/teams/${team.id}/join`)
      if (action === 'leave') await api.delete(`/teams/${team.id}/members/me`)
      if (action === 'close') await api.post(`/teams/${team.id}/close`)
      await loadTeams(true)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusyTeamId(null)
    }
  }

  const visibleTeams = teams
  const joinedCount = teams.filter((team) => team.members.some((member) => member.id === user.id)).length
  const availableSeats = teams.reduce((total, team) => total + Math.max(0, team.maxMembers - team.memberCount), 0)

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-lockup"><span>Movers Squad</span></div>
          <nav className="main-nav" aria-label="主导航"><a className="active" href="#teams">组队大厅</a></nav>
          <div className="topbar-actions">
            <button className={`notification-button notification-${notificationState}`} type="button" onClick={enableNotifications} disabled={notificationState === 'unsupported'} title="系统通知权限">
              {notificationState === 'granted' ? <Bell size={17} /> : <BellOff size={17} />}
              <span>{notificationState === 'granted' ? '通知已开启' : notificationState === 'denied' ? '通知已拒绝' : notificationState === 'unsupported' ? '不支持通知' : '开启通知'}</span>
            </button>
            <div className="user-menu-wrap">
              <button className="user-chip user-chip-button" type="button" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}><Avatar user={user} size="sm" /><span>{user.florrId}</span><ChevronDown size={15} /></button>
              {userMenuOpen && <div className="user-menu"><button type="button" onClick={() => { setProfileOpen(true); setUserMenuOpen(false) }}><UserCog size={16} />档案设置</button><button type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>}
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="dashboard-heading">
          <div><span className="eyebrow">FLORR.IO SQUAD LOBBY</span><h1>组队大厅</h1><p>查看正在招募的 Florr.io 队伍，选择一支加入。</p></div>
          <button className="button-primary create-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={19} />发布招募</button>
        </section>

        <section className="stats-band" aria-label="大厅概况">
          <div><span className="stat-icon blue"><UsersRound size={19} /></span><span><strong>{teams.length}</strong><small>开放队伍</small></span></div>
          <div><span className="stat-icon green"><ShieldCheck size={19} /></span><span><strong>{availableSeats}</strong><small>剩余位置</small></span></div>
          <div><span className="stat-icon gray"><Gamepad2 size={19} /></span><span><strong>{joinedCount}</strong><small>我的队伍</small></span></div>
        </section>

        <section className="teams-section" id="teams">
          <div className="teams-toolbar">
            <div><h2>开放招募</h2><span>{visibleTeams.length} 支队伍</span></div>
            <div className="toolbar-actions">
              <button className="icon-button refresh-button" type="button" onClick={() => void loadTeams()} title="刷新队伍"><RefreshCw size={18} /></button>
            </div>
          </div>

          {loading ? (
            <div className="teams-loading" role="status">正在载入招募...</div>
          ) : visibleTeams.length === 0 ? (
            <div className="empty-state"><span><UsersRound size={24} /></span><h3>目前还没有招募</h3><p>发布第一条招募，等待队友加入。</p><button className="button-primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={18} />发布招募</button></div>
          ) : (
            <div className="team-grid">{visibleTeams.map((team) => <TeamCard key={team.id} team={team} currentUser={user} busy={busyTeamId === team.id} onAction={handleAction} />)}</div>
          )}
        </section>
      </main>

      <CreateTeamForm open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(team) => { setTeams((current) => [team, ...current]); setCreateOpen(false) }} />
      <ProfileSettings user={{ ...user, level: user.level ?? 1 }} open={profileOpen} onClose={() => setProfileOpen(false)} onSaved={onUserUpdated} />
      <ErrorDialog message={error} onClose={() => setError('')} />
      <footer className="site-footer dashboard-footer">©Movers 2026</footer>
    </div>
  )
}
