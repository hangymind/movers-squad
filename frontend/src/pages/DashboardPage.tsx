import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellOff, CheckCircle2, ChevronDown, Clock3, Link2, LogOut, Plus, RefreshCw, ShieldCheck, UsersRound, UserCog, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { CreateTeamForm } from '../components/CreateTeamForm'
import { TeamCard } from '../components/TeamCard'
import { TeamDetailsDrawer } from '../components/TeamDetailsDrawer'
import { ProfileSettings } from '../components/ProfileSettings'
import { api, getErrorMessage } from '../lib/api'
import { createEcho } from '../lib/echo'
import { requestNotificationPermissionOnEntry, showJoinNotification, showTeamAssembledNotification } from '../lib/notifications'
import { parseTeamListResponse } from '../lib/teamListResponse'
import type { FlorrBindingReviewedEvent, Team, TeamAssembledEvent, TeamClosedEvent, TeamMemberJoinedEvent, TeamMemberLeftEvent, User } from '../types'
import { ErrorDialog } from '../components/ErrorDialog'

interface DashboardPageProps { user: User; onUserUpdated: (user: User) => void; onLogout: () => Promise<void> }
type NotificationState = 'unsupported' | NotificationPermission

export function DashboardPage({ user, onUserUpdated, onLogout }: DashboardPageProps) {
  const navigate = useNavigate()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busyTeamId, setBusyTeamId] = useState<number | null>(null)
  const [notificationState, setNotificationState] = useState<NotificationState>('Notification' in window ? Notification.permission : 'unsupported')
  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [bindingPromptOpen, setBindingPromptOpen] = useState(!user.isFlorrVerified && user.florrBinding?.status !== 'pending' && !user.florrBinding?.resultUnread)
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))
  const teamsRef = useRef<Team[]>([])

  useEffect(() => { teamsRef.current = teams }, [teams])

  useEffect(() => {
    void requestNotificationPermissionOnEntry().then(setNotificationState)
  }, [])

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
      const { data } = await api.get<unknown>('/teams')
      const nextTeams = parseTeamListResponse(data)
      if (nextTeams === null) {
        setError('服务器返回的队伍数据格式不正确，请刷新重试。')
        return
      }
      setTeams(nextTeams)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Loading remote team state is the synchronization this effect owns.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    api.get<{ data: Team | null }>('/teams/current').then(({ data }) => {
      if (data.data?.isAssembled) navigate(`/teams/${data.data.id}/room`, { replace: true })
      else void loadTeams()
    }).catch(() => void loadTeams())
  }, [loadTeams, navigate])

  useEffect(() => () => echo.disconnect(), [echo])

  useEffect(() => {
    echo.private(`user.${user.id}`).listen('.FlorrBindingReviewed', (_event: FlorrBindingReviewedEvent) => {
      api.get<{ data: User }>('/user').then(({ data }) => onUserUpdated(data.data)).catch(() => undefined)
      void loadTeams(true)
    })
    return () => { echo.leave(`user.${user.id}`) }
  }, [echo, loadTeams, onUserUpdated, user.id])

  useEffect(() => {
    // Subscribe once for the recruitment hall. Team events are public because
    // the hall itself is public; this keeps every user's cards synchronized.
    const channel = echo.private('teams')
    channel.listen('.TeamMemberJoined', (event: TeamMemberJoinedEvent) => {
      const currentTeam = teamsRef.current.find((team) => team.id === event.team.id)
      const isCurrentMember = currentTeam?.members.some((member) => member.id === user.id) ?? false
      if (isCurrentMember && event.joinedUser.id !== user.id) showJoinNotification(event, user.id)
      if (event.isAssembled && isCurrentMember) {
        const assembledEvent: TeamAssembledEvent = { team: event.team, assembledAt: event.joinedAt }
        showTeamAssembledNotification(assembledEvent)
        navigate(`/teams/${event.team.id}/room`)
        return
      }
      void loadTeams(true)
    })
    channel.listen('.TeamAssembled', (event: TeamAssembledEvent) => {
      const currentTeam = teamsRef.current.find((team) => team.id === event.team.id)
      if (!currentTeam?.members.some((member) => member.id === user.id)) return
      showTeamAssembledNotification(event)
      navigate(`/teams/${event.team.id}/room`)
    })
    channel.listen('.TeamMemberLeft', (_event: TeamMemberLeftEvent) => { void loadTeams(true) })
    channel.listen('.TeamClosed', (_event: TeamClosedEvent) => { void loadTeams(true) })
    return () => { echo.leave('teams') }
  }, [echo, user.id, loadTeams, navigate])

  const enableNotifications = async () => {
    setNotificationState(await requestNotificationPermissionOnEntry())
  }

  const handleAction = async (team: Team, action: 'join' | 'leave' | 'close') => {
    if (action === 'join' && !user.isFlorrVerified) { setBindingPromptOpen(true); return }
    setBusyTeamId(team.id)
    setError('')
    try {
      if (action === 'join') {
        const { data } = await api.post<{ data: Team }>(`/teams/${team.id}/join`)
        if (data.data.isAssembled) {
          const event = { team: { id: data.data.id, gameName: data.data.gameName }, assembledAt: data.data.assembledAt ?? new Date().toISOString() }
          showTeamAssembledNotification(event)
          navigate(`/teams/${team.id}/room`)
          return
        }
      }
      if (action === 'leave') await api.delete(`/teams/${team.id}/members/me`)
      if (action === 'close') await api.post(`/teams/${team.id}/close`)
      await loadTeams(true)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusyTeamId(null)
    }
  }

  const openCreate = () => {
    if (!user.isFlorrVerified) { setBindingPromptOpen(true); return }
    setCreateOpen(true)
  }

  const acknowledgeResult = async () => {
    const binding = user.florrBinding
    if (!binding?.id) return false
    try {
      await api.post(`/florr-bindings/${binding.id}/acknowledge`)
      onUserUpdated({ ...user, florrBinding: { ...binding, resultUnread: false } })
      return true
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      return false
    }
  }

  const reapply = async () => {
    if (await acknowledgeResult()) navigate('/bind-florr')
  }

  const visibleTeams = teams
  const joinedCount = teams.filter((team) => team.members.some((member) => member.id === user.id)).length
  const availableSeats = teams.reduce((total, team) => total + Math.max(0, team.maxMembers - team.memberCount), 0)

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-lockup"><span>Movers Squad</span><small>伐木.io</small></div>
          <nav className="main-nav" aria-label="主导航"><a className="active" href="#teams">招募</a></nav>
          <div className="topbar-actions">
            <button className={`notification-button notification-${notificationState}`} type="button" onClick={enableNotifications} disabled={notificationState === 'unsupported'} title={notificationState === 'denied' ? '请在浏览器站点设置中允许通知' : '系统通知权限'}>
              {notificationState === 'granted' ? <Bell size={17} /> : <BellOff size={17} />}
              <span>{notificationState === 'granted' ? '通知已开启' : notificationState === 'denied' ? '通知已拒绝' : notificationState === 'unsupported' ? '不支持通知' : '开启通知'}</span>
            </button>
            <div className="user-menu-wrap">
              <button className="user-chip user-chip-button" type="button" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen}><Avatar user={user} size="sm" /><span className="user-chip-name">{user.florrId}</span><ChevronDown size={15} /></button>
              {userMenuOpen && <div className="user-menu">{user.isAdmin && <button type="button" onClick={() => navigate('/admin')}><ShieldCheck size={16} />管理后台</button>}<button type="button" onClick={() => { setProfileOpen(true); setUserMenuOpen(false) }}><UserCog size={16} />档案设置</button><button type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>}
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="dashboard-heading">
          <div><h1>MOV组队大厅</h1><p>Any squad?Any hunt?Any bonus?</p></div>
          <button className="button-primary create-button" type="button" onClick={openCreate}><Plus size={19} />发布招募</button>
        </section>

        {user.florrBinding?.status === 'pending' && <section className="binding-status-banner" role="status"><span><Clock3 size={19} /></span><div><strong>Florr 绑定申请正在审批</strong><p>审核最长可能需要 2 天，完成后会通知你。</p></div></section>}

        <section className="stats-band" aria-label="大厅概况">
          <div><strong>{teams.length}</strong><span>开放队伍</span></div>
          <div><strong>{availableSeats}</strong><span>剩余位置</span></div>
          <div><strong>{joinedCount}</strong><span>我的队伍</span></div>
        </section>

        <section className="teams-section" id="teams">
          <div className="teams-toolbar">
            <div><h2>当前招募</h2><span>{visibleTeams.length} 支队伍</span></div>
            <div className="toolbar-actions">
              <button className="icon-button refresh-button" type="button" onClick={() => void loadTeams()} title="刷新队伍"><RefreshCw size={18} /></button>
            </div>
          </div>

          {loading ? (
            <div className="teams-loading" role="status">正在载入招募...</div>
          ) : visibleTeams.length === 0 ? (
            <div className="empty-state"><span><UsersRound size={24} /></span><h3>目前还没有招募</h3><p>发布第一条招募，等待队友加入。</p><button className="button-primary" type="button" onClick={openCreate}><Plus size={18} />发布招募</button></div>
          ) : (
            <div className="team-grid">{visibleTeams.map((team) => <TeamCard key={team.id} team={team} currentUser={user} busy={busyTeamId === team.id} onAction={handleAction} onOpen={setSelectedTeam} />)}</div>
          )}
        </section>
      </main>

      <CreateTeamForm open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(team) => { setTeams((current) => [team, ...current]); setCreateOpen(false) }} />
      <ProfileSettings user={{ ...user, level: user.level ?? 1 }} open={profileOpen} onClose={() => setProfileOpen(false)} onSaved={onUserUpdated} />
      <TeamDetailsDrawer team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      <ErrorDialog message={error} onClose={() => setError('')} />
      {bindingPromptOpen && <div className="modal-backdrop"><section className="modal binding-prompt" role="dialog" aria-modal="true" aria-labelledby="binding-prompt-title"><span className="section-icon"><Link2 size={20} /></span><h2 id="binding-prompt-title">绑定 Florr 账户</h2><p>完成游戏账户验证后，才能发布招募或加入队伍。</p><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setBindingPromptOpen(false)}>暂时忽略</button><button className="button-primary" type="button" onClick={() => navigate('/bind-florr')}>去绑定</button></div></section></div>}
      {user.florrBinding?.resultUnread && <div className="modal-backdrop result-backdrop"><section className="modal binding-result" role="alertdialog" aria-modal="true">{user.florrBinding.status === 'approved' ? <><CheckCircle2 className="result-approved" size={43} /><h2>Florr 绑定已通过</h2><p>你的账户已完成验证，发布招募和加入队伍功能现已解锁。</p><button className="button-primary" type="button" onClick={() => void acknowledgeResult()}>知道了</button></> : <><XCircle className="result-rejected" size={43} /><h2>Florr 绑定未通过</h2><p className="rejection-copy">{user.florrBinding.rejectionReason}</p><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => void acknowledgeResult()}>稍后处理</button><button className="button-primary" type="button" onClick={() => void reapply()}>重新申请</button></div></>}</section></div>}
      <footer className="site-footer dashboard-footer">©Movers 2026</footer>
    </div>
  )
}
