import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Crosshair, DoorOpen, Hash, LogOut, Plus, Radio, ShieldCheck, Swords, UsersRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'
import { createEcho, observeEchoConnection, type EchoConnectionStatus } from '../lib/echo'
import { experienceProgress } from '../lib/geoHunt'
import type { GeoHuntLobby, GeoHuntMatchFoundEvent, User } from '../types'
import './GeoHunt.css'

interface Props { user: User; onLogout: () => Promise<void> }

export function GeoHuntLobbyPage({ user, onLogout }: Props) {
  const navigate = useNavigate()
  const [lobby, setLobby] = useState<GeoHuntLobby | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<EchoConnectionStatus>('reconnecting')
  const [roomCode, setRoomCode] = useState('')
  const [privateCapacity, setPrivateCapacity] = useState(2)
  const [publicCapacity, setPublicCapacity] = useState(4)
  const [publicName, setPublicName] = useState('')
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: GeoHuntLobby }>('/geo-hunt/lobby')
      setLobby(data.data)
      if (data.data.currentMatchId) navigate(`/geo-hunt/matches/${data.data.currentMatchId}`, { replace: true })
      else if (data.data.currentRoomCode) navigate(`/geo-hunt/rooms/${data.data.currentRoomCode}`, { replace: true })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }, [navigate])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const stopObserving = observeEchoConnection(echo, setConnectionStatus)
    const channel = echo.private(`user.${user.id}`)
    const lobbyChannel = echo.private('geo-hunt.lobby')
    channel.listen('.GeoHuntMatchFound', (event: GeoHuntMatchFoundEvent) => navigate(`/geo-hunt/matches/${event.matchId}`))
    lobbyChannel.listen('.GeoHuntLobbyChanged', () => void load())
    return () => { stopObserving(); echo.leave(`user.${user.id}`); echo.leave('geo-hunt.lobby'); echo.disconnect() }
  }, [echo, load, navigate, user.id])
  useEffect(() => {
    if (!lobby?.queued) return
    const interval = window.setInterval(async () => {
      try {
        const { data } = await api.post<{ data: { queued: boolean; matchId: number | null } }>('/geo-hunt/queue')
        if (data.data.matchId) navigate(`/geo-hunt/matches/${data.data.matchId}`)
        else void load()
      } catch (requestError) { setError(getErrorMessage(requestError)) }
    }, 10_000)
    const poll = window.setInterval(() => void load(), connectionStatus === 'connected' ? 30_000 : 3_000)
    return () => { window.clearInterval(interval); window.clearInterval(poll) }
  }, [connectionStatus, load, lobby?.queued, navigate])

  const toggleQueue = async () => {
    setBusy(true)
    setError('')
    try {
      if (lobby?.queued) {
        await api.delete('/geo-hunt/queue')
        await load()
      } else {
        const { data } = await api.post<{ data: { queued: boolean; matchId: number | null } }>('/geo-hunt/queue')
        if (data.data.matchId) navigate(`/geo-hunt/matches/${data.data.matchId}`)
        else await load()
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  const profile = lobby?.profile ?? user.geoHuntProfile
  const progress = experienceProgress(profile)

  const createRoom = async (mode: 'private' | 'admin_public') => {
    setBusy(true); setError('')
    try {
      const { data } = await api.post<{ data: { code: string } }>('/geo-hunt/rooms', {
        mode, maxPlayers: mode === 'private' ? privateCapacity : publicCapacity,
        name: mode === 'admin_public' ? publicName.trim() : undefined,
      })
      navigate(`/geo-hunt/rooms/${data.data.code}`)
    } catch (requestError) { setError(getErrorMessage(requestError)); setBusy(false) }
  }
  const joinRoom = async (code = roomCode) => {
    const normalized = code.trim().toUpperCase()
    if (normalized.length !== 6) return
    setBusy(true); setError('')
    try {
      const { data } = await api.post<{ data: { code: string } }>('/geo-hunt/rooms/join', { code: normalized })
      navigate(`/geo-hunt/rooms/${data.data.code}`)
    } catch (requestError) { setError(getErrorMessage(requestError)); setBusy(false) }
  }

  return <div className="geo-page">
    <header className="room-topbar geo-topbar">
      <div className="brand-lockup"><span>Movers Squad</span><small>图寻对决</small></div>
      <nav className="main-nav room-main-nav" aria-label="主导航"><Link to="/">招募</Link><Link to="/public-room">公共</Link><Link className="active" to="/geo-hunt">图寻</Link></nav>
      <div className="room-topbar-actions"><Link className="button-secondary geo-header-link" to="/"><ArrowLeft size={16} />返回大厅</Link><button className="button-secondary" type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>
    </header>
    <main className="geo-lobby-shell">
      <section className="geo-lobby-intro">
        <div><span className="eyebrow">1V1 MAP DUEL</span><h1>图寻</h1><p>观察随机地图切片，在完整地图中锁定它的位置。</p></div>
        <div className="geo-queue-count"><Radio size={18} /><strong>{lobby?.queueCount ?? 0}</strong><span>匹配池玩家</span></div>
      </section>

      {!user.isFlorrVerified ? <section className="geo-locked" role="status"><ShieldCheck size={34} /><div><h2>需要完成 Florr 绑定</h2><p>图寻使用已验证身份进行匹配和记录等级。</p></div><Link className="button-primary" to="/bind-florr">去绑定</Link></section> : <>
        <section className="geo-career" aria-label="图寻生涯">
          <div className="geo-level"><span>图寻等级</span><strong>Lv.{profile?.level ?? 1}</strong><div className="geo-xp-track" aria-label={`经验进度 ${Math.round(progress)}%`}><i style={{ width: `${progress}%` }} /></div><small>{profile?.experienceIntoLevel ?? 0} / {profile?.experienceForNextLevel ?? 100} XP</small></div>
          <dl><div><dt>胜利</dt><dd>{profile?.wins ?? 0}</dd></div><div><dt>失败</dt><dd>{profile?.losses ?? 0}</dd></div><div><dt>对局</dt><dd>{profile?.matchesPlayed ?? 0}</dd></div></dl>
        </section>

        <section className={`geo-match-panel${lobby?.queued ? ' is-searching' : ''}`}>
          <div className="geo-match-symbol">{lobby?.queued ? <Radio size={38} /> : <Crosshair size={38} />}</div>
          <div><h2>{lobby?.queued ? '正在寻找对手' : '准备开始对决'}</h2><p>{lobby?.queued ? '保持页面打开，匹配成功后会自动进入房间。' : '双方 6000 HP，距离目标更近的一方造成伤害。'}</p></div>
          <button className={lobby?.queued ? 'button-secondary geo-cancel-match' : 'button-primary geo-start-match'} type="button" disabled={busy || !lobby} onClick={() => void toggleQueue()}>{lobby?.queued ? '取消匹配' : <><Swords size={18} />开始匹配</>}</button>
        </section>

        <section className="geo-custom-lobby">
          <header><div><span className="eyebrow">CUSTOM ROOMS</span><h2>自定义对局</h2></div><p>自定义房不计入等级经验和生涯战绩。</p></header>
          <div className="geo-room-tools">
            <form onSubmit={(event) => { event.preventDefault(); void joinRoom() }}><label htmlFor="geo-room-code"><Hash size={17} />输入房间码</label><div><input id="geo-room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC234" maxLength={6} /><button className="button-secondary" type="submit" disabled={busy || roomCode.length !== 6}><DoorOpen size={16} />加入</button></div></form>
            <div className="geo-create-room"><div><LockRoomIcon /><div><strong>私人对局</strong><span>凭房间码邀请 2–8 人</span></div></div><label>容量<select value={privateCapacity} onChange={(event) => setPrivateCapacity(Number(event.target.value))}>{[2,3,4,5,6,7,8].map((value) => <option key={value}>{value}</option>)}</select></label><button className="button-primary" type="button" disabled={busy} onClick={() => void createRoom('private')}><Plus size={16} />创建</button></div>
          </div>

          {user.isAdmin && <section className="geo-admin-create"><div><ShieldCheck size={24} /><div><strong>开启管理员多人房</strong><span>房间会公开显示在大厅。</span></div></div><input value={publicName} onChange={(event) => setPublicName(event.target.value)} maxLength={80} placeholder="输入房间名称" /><select value={publicCapacity} onChange={(event) => setPublicCapacity(Number(event.target.value))}>{[2,3,4,5,6,7,8].map((value) => <option key={value} value={value}>{value} 人</option>)}</select><button className="button-primary" type="button" disabled={busy || !publicName.trim()} onClick={() => void createRoom('admin_public')}><UsersRound size={17} />开启房间</button></section>}

          <section className="geo-public-rooms"><div className="geo-public-heading"><h3>公开多人房</h3><span>{lobby?.publicRooms.length ?? 0} 个开放房间</span></div>{!lobby?.publicRooms.length ? <div className="geo-public-empty">当前没有管理员公开房</div> : <div>{lobby.publicRooms.map((room) => <article key={room.id}><div><strong>{room.name}</strong><span>房主 {room.host?.florrId ?? '-'} · 房间码 {room.code}</span></div><b>{room.playerCount}/{room.maxPlayers}</b><button className="button-secondary" disabled={busy || room.playerCount >= room.maxPlayers} onClick={() => void joinRoom(room.code)}>加入</button></article>)}</div>}</section>
        </section>
      </>}
      {error && <div className="page-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>关闭</button></div>}
    </main>
  </div>
}

function LockRoomIcon() { return <Hash size={24} aria-hidden="true" /> }
