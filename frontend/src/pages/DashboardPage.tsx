import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bell, BellOff, CheckCircle2, ChevronDown, Clock3, Link2, LogOut, Plus, RefreshCw, ShieldCheck, UsersRound, UserCog, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { CreateTeamForm } from '../components/CreateTeamForm'
import { TeamCard } from '../components/TeamCard'
import { TeamDetailsDrawer } from '../components/TeamDetailsDrawer'
import { ProfileSettings } from '../components/ProfileSettings'
import { api, getErrorMessage } from '../lib/api'
import { createEcho, observeEchoConnection } from '../lib/echo'
import { requestNotificationPermission, showJoinNotification, showMemberLeftNotification, showTeamAssembledNotification, showTeamCreatedNotification } from '../lib/notifications'
import { NotificationSettingsPanel } from '../components/NotificationSettingsPanel'
import { parseTeamListResponse } from '../lib/teamListResponse'
import type { FlorrBindingReviewedEvent, Team, TeamAssembledEvent, TeamClosedEvent, TeamCreatedEvent, TeamMemberJoinedEvent, TeamMemberLeftEvent, User } from '../types'
import { ErrorDialog } from '../components/ErrorDialog'

interface DashboardPageProps { user: User; onUserUpdated: (user: User) => void; onLogout: () => Promise<void> }
type NotificationState = 'unsupported' | NotificationPermission
const fallbackNotificationSettings = { showJoinNotifications: true, showTeamCreatedNotifications: true, showMemberLeftNotifications: true, notificationSoundEnabled: true }

export function DashboardPage({ user, onUserUpdated, onLogout }: DashboardPageProps) {
  const navigate = useNavigate()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false)
  const [replaceCurrentTeam, setReplaceCurrentTeam] = useState(false)
  const [busyTeamId, setBusyTeamId] = useState<number | null>(null)
  const [notificationState, setNotificationState] = useState<NotificationState>('Notification' in window ? Notification.permission : 'unsupported')
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [bindingPromptOpen, setBindingPromptOpen] = useState(!user.isFlorrVerified && user.florrBinding?.status !== 'pending' && !user.florrBinding?.resultUnread)
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const notificationSettings = useMemo(() => user.notificationSettings ? { ...fallbackNotificationSettings, ...user.notificationSettings } : fallbackNotificationSettings, [user.notificationSettings])
  const teamsRef = useRef<Team[]>([])
  const teamsRequestRef = useRef(0)
  const teamsRevisionRef = useRef(0)

  useEffect(() => { teamsRef.current = teams }, [teams])

  const updateTeams = useCallback((update: (current: Team[]) => Team[]) => {
    const nextTeams = update(teamsRef.current)
    teamsRef.current = nextTeams
    setTeams(nextTeams)
  }, [])

  const updateTeamsFromEvent = useCallback((update: (current: Team[]) => Team[]) => {
    teamsRevisionRef.current += 1
    updateTeams(update)
  }, [updateTeams])

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
    const requestId = ++teamsRequestRef.current
    const revision = teamsRevisionRef.current
    try {
      const { data } = await api.get<unknown>('/teams')
      if (requestId !== teamsRequestRef.current || revision !== teamsRevisionRef.current) return
      const nextTeams = parseTeamListResponse(data)
      if (nextTeams === null) {
        updateTeams(() => [])
        setError('服务器返回的队伍数据格式不正确，请刷新重试。')
        return
      }
      for (const nextTeam of nextTeams) {
        const previousTeam = teamsRef.current.find((team) => team.id === nextTeam.id)
        const userWasMember = previousTeam?.members.some((member) => member.id === user.id) ?? false
        if (!userWasMember || !nextTeam.members.some((member) => member.id === user.id)) continue
        for (const joinedUser of nextTeam.members) {
          if (previousTeam?.members.some((member) => member.id === joinedUser.id)) continue
          showJoinNotification({
            team: { id: nextTeam.id, gameName: nextTeam.gameName },
            joinedUser,
            joinedAt: new Date().toISOString(),
          }, user.id)
        }
      }
      updateTeams(() => nextTeams)
    } catch (requestError) {
      if (requestId === teamsRequestRef.current && revision === teamsRevisionRef.current) {
        setError(getErrorMessage(requestError))
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [updateTeams, user.id])

  const checkCurrentTeam = useCallback(async () => {
    const { data } = await api.get<{ data: Team | null }>('/teams/current')
    if (!data.data?.isAssembled) return false
    showTeamAssembledNotification({
      team: { id: data.data.id, gameName: data.data.gameName },
      assembledAt: data.data.assembledAt ?? new Date().toISOString(),
    })
    navigate(`/teams/${data.data.id}/room`, { replace: true })
    return true
  }, [navigate])

  // Loading remote team state is the synchronization this effect owns.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    checkCurrentTeam().then((assembled) => { if (!assembled) void loadTeams() })
      .catch(() => void loadTeams())
  }, [checkCurrentTeam, loadTeams])

  useEffect(() => () => echo.disconnect(), [echo])

  useEffect(() => observeEchoConnection(echo, setRealtimeConnected), [echo])

  useEffect(() => {
    const sync = () => {
      void loadTeams(true)
      if (!realtimeConnected) void checkCurrentTeam().catch(() => undefined)
    }
    const interval = window.setInterval(sync, realtimeConnected ? 30_000 : 5_000)
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [checkCurrentTeam, loadTeams, realtimeConnected])

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
    channel.listen('.TeamCreated', (event: TeamCreatedEvent) => { if (event.team?.owner?.id !== user.id) showTeamCreatedNotification(event, notificationSettings); void loadTeams(true) })
    channel.listen('.TeamMemberJoined', (event: TeamMemberJoinedEvent) => {
      const currentTeam = teamsRef.current.find((team) => team.id === event.team.id)
      const isCurrentMember = currentTeam?.members.some((member) => member.id === user.id) ?? false
      if (isCurrentMember && event.joinedUser.id !== user.id) showJoinNotification(event, user.id, notificationSettings)
      updateTeamsFromEvent((current) => current.flatMap((team) => {
        if (team.id !== event.team.id) return [team]
        if (event.isAssembled) return []
        const members = team.members.some((member) => member.id === event.joinedUser.id)
          ? team.members
          : [...team.members, event.joinedUser]
        return [{ ...team, members, memberCount: members.length, isFull: members.length >= team.maxMembers }]
      }))
      if (event.isAssembled && isCurrentMember) {
        const assembledEvent: TeamAssembledEvent = { team: event.team, assembledAt: event.joinedAt }
        showTeamAssembledNotification(assembledEvent, notificationSettings)
        navigate(`/teams/${event.team.id}/room`)
        return
      }
      if (!currentTeam) void loadTeams(true)
    })
    channel.listen('.TeamAssembled', (event: TeamAssembledEvent) => {
      const currentTeam = teamsRef.current.find((team) => team.id === event.team.id)
      updateTeamsFromEvent((current) => current.filter((team) => team.id !== event.team.id))
      if (currentTeam?.members.some((member) => member.id === user.id)) {
        showTeamAssembledNotification(event, notificationSettings)
        navigate(`/teams/${event.team.id}/room`)
      }
    })
    channel.listen('.TeamMemberLeft', (event: TeamMemberLeftEvent) => {
      const currentTeam = teamsRef.current.find((team) => team.id === event.teamId)
      if (currentTeam?.members.some((member) => member.id === user.id) && event.user.id !== user.id) showMemberLeftNotification(event, notificationSettings)
      updateTeamsFromEvent((current) => current.map((team) => {
        if (team.id !== event.teamId) return team
        const members = team.members.filter((member) => member.id !== event.user.id)
        return { ...team, members, memberCount: members.length, isFull: false }
      }))
    })
    channel.listen('.TeamClosed', (event: TeamClosedEvent) => {
      updateTeamsFromEvent((current) => current.filter((team) => team.id !== event.teamId))
    })
    return () => { echo.leave('teams') }
  }, [echo, user.id, loadTeams, navigate, updateTeamsFromEvent, notificationSettings])

  const enableNotifications = async () => {
    setNotificationState(await requestNotificationPermission())
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
    if (teams.some((team) => team.owner.id === user.id)) {
      setReplaceConfirmOpen(true)
      return
    }
    if (teams.some((team) => team.members.some((member) => member.id === user.id))) {
      setError('你已经加入了其他队长的招募，请先退出当前队伍。')
      return
    }
    setReplaceCurrentTeam(false)
    setCreateOpen(true)
  }

  const confirmReplace = () => {
    setReplaceConfirmOpen(false)
    setReplaceCurrentTeam(true)
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
          {userMenuOpen && <div className="user-menu">{user.isAdmin && <button type="button" onClick={() => navigate('/admin')}><ShieldCheck size={16} />管理后台</button>}<button type="button" onClick={() => { setProfileOpen(true); setUserMenuOpen(false) }}><UserCog size={16} />档案设置</button><button type="button" onClick={() => { setNotificationSettingsOpen(true); setUserMenuOpen(false) }}><Bell size={16} />通知设置</button><button type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>}
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
          {!realtimeConnected && <div className="modal-backdrop realtime-overlay"><section className="modal" role="alertdialog" aria-modal="true"><h2>实时连接已断开</h2><p>队伍状态可能无法实时同步，请重试连接。</p><button className="button-primary" type="button" onClick={() => window.location.reload()}><RefreshCw size={17} />重试连接</button></section></div>}
        </section>
      </main>

      <CreateTeamForm open={createOpen} replaceCurrentTeam={replaceCurrentTeam} onClose={() => { setCreateOpen(false); setReplaceCurrentTeam(false) }} onCreated={(team) => { updateTeamsFromEvent((current) => [team, ...current.filter((item) => item.id !== team.id && (!replaceCurrentTeam || item.owner.id !== user.id))]); setCreateOpen(false); setReplaceCurrentTeam(false) }} />
      <ProfileSettings user={{ ...user, level: user.level ?? 1 }} open={profileOpen} onClose={() => setProfileOpen(false)} onSaved={onUserUpdated} />
      <NotificationSettingsPanel user={user} open={notificationSettingsOpen} onClose={() => setNotificationSettingsOpen(false)} onSaved={onUserUpdated} />
      <TeamDetailsDrawer team={selectedTeam} onClose={() => setSelectedTeam(null)} />
      <ErrorDialog message={error} onClose={() => setError('')} />
      {replaceConfirmOpen && <div className="modal-backdrop"><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="replace-team-title"><span className="section-icon"><AlertTriangle size={20} /></span><h2 id="replace-team-title">替换当前招募？</h2><p>新招募发布成功后，当前正在招人的队伍会自动关闭，原队伍成员也会退出该招募。</p><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setReplaceConfirmOpen(false)}>取消</button><button className="button-danger" type="button" onClick={confirmReplace}>确认并继续</button></div></section></div>}
      {bindingPromptOpen && <div className="modal-backdrop"><section className="modal binding-prompt" role="dialog" aria-modal="true" aria-labelledby="binding-prompt-title"><span className="section-icon"><Link2 size={20} /></span><h2 id="binding-prompt-title">绑定 Florr 账户</h2><p>完成游戏账户验证后，才能发布招募或加入队伍。</p><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setBindingPromptOpen(false)}>暂时忽略</button><button className="button-primary" type="button" onClick={() => navigate('/bind-florr')}>去绑定</button></div></section></div>}
      {user.florrBinding?.resultUnread && <div className="modal-backdrop result-backdrop"><section className="modal binding-result" role="alertdialog" aria-modal="true">{user.florrBinding.status === 'approved' ? <><CheckCircle2 className="result-approved" size={43} /><h2>Florr 绑定已通过</h2><p>你的账户已完成验证，发布招募和加入队伍功能现已解锁。</p><button className="button-primary" type="button" onClick={() => void acknowledgeResult()}>知道了</button></> : <><XCircle className="result-rejected" size={43} /><h2>Florr 绑定未通过</h2><p className="rejection-copy">{user.florrBinding.rejectionReason}</p><div className="modal-actions"><button className="button-secondary" type="button" onClick={() => void acknowledgeResult()}>稍后处理</button><button className="button-primary" type="button" onClick={() => void reapply()}>重新申请</button></div></>}</section></div>}
      <footer className="site-footer dashboard-footer">©Movers 2026</footer>
    </div>
  )
}
