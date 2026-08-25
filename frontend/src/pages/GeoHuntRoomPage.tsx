import { useCallback, useEffect, useState } from 'react'
import { Copy, Crown, Eye, EyeOff, LogOut, Play, UsersRound } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { api, getErrorMessage } from '../lib/api'
import { createEcho } from '../lib/echo'
import type { GeoHuntRoomState, User } from '../types'
import './GeoHunt.css'

interface Props { user: User; onLogout: () => Promise<void> }

export function GeoHuntRoomPage({ user, onLogout }: Props) {
  const code = (useParams().code ?? '').toUpperCase()
  const navigate = useNavigate()
  const [room, setRoom] = useState<GeoHuntRoomState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [codeVisible, setCodeVisible] = useState(false)
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))
  const roomId = room?.id
  const roomTitle = room ? (room.name ?? '私人对局') : null

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: GeoHuntRoomState }>(`/geo-hunt/rooms/${code}`)
      if (data.data.status !== 'waiting') {
        navigate(`/geo-hunt/matches/${data.data.id}`, { replace: true })
        return
      }
      setRoom(data.data)
      setError('')
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }, [code, navigate])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => echo.disconnect(), [echo])
  useEffect(() => {
    if (!roomId) return
    const channel = echo.private(`geo-hunt.match.${roomId}`)
    channel.listen('.GeoHuntStateChanged', () => void load())
    const poll = window.setInterval(() => void load(), 5_000)
    return () => { window.clearInterval(poll); echo.leave(`geo-hunt.match.${roomId}`) }
  }, [echo, load, roomId])
  useEffect(() => {
    if (!roomTitle) return
    const previous = document.title
    document.title = `${roomTitle} | 图寻 | Movers Squad`
    return () => { document.title = previous }
  }, [roomTitle])

  const start = async () => {
    setBusy(true)
    try {
      const { data } = await api.post<{ data: { matchId: number } }>(`/geo-hunt/rooms/${code}/start`)
      navigate(`/geo-hunt/matches/${data.data.matchId}`, { replace: true })
    } catch (requestError) { setError(getErrorMessage(requestError)); setBusy(false) }
  }
  const leave = async () => {
    setBusy(true)
    try { await api.delete(`/geo-hunt/rooms/${code}/members/me`); navigate('/geo-hunt', { replace: true }) }
    catch (requestError) { setError(getErrorMessage(requestError)); setBusy(false) }
  }
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }

  if (!room && error) return <div className="geo-page"><main className="geo-room-shell"><section className="geo-room-load-error" role="alert"><UsersRound size={30} /><h1>无法进入房间</h1><p>{error}</p><div><Link className="button-secondary" to="/geo-hunt">返回大厅</Link><button className="button-primary" type="button" onClick={() => void load()}>重试</button></div></section></main></div>
  if (!room) return <div className="room-loading" role="status">正在进入图寻房间...</div>
  const isHost = room.hostId === user.id

  return <div className="geo-page">
    <header className="room-topbar geo-topbar"><div className="brand-lockup"><span>Movers Squad</span><small>图寻房间</small></div><div className="room-topbar-actions"><button className="button-secondary" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div></header>
    <main className="geo-room-shell">
      <section className="geo-room-heading"><div><span className="eyebrow">CUSTOM MAP DUEL</span><h1>{room.name ?? '私人对局'}</h1><p>{room.mode === 'admin_public' ? '管理员公开多人房' : '不公开私人房'} · {room.playerCount}/{room.maxPlayers} 人</p></div><div className="geo-room-code"><span>房间码</span><strong aria-label={codeVisible || room.mode === 'admin_public' ? `房间码 ${room.code}` : '房间码已隐藏'}>{codeVisible || room.mode === 'admin_public' ? room.code : '••••••'}</strong><div className="geo-room-code-actions">{room.mode === 'private' && <button type="button" onClick={() => setCodeVisible((visible) => !visible)} aria-label={codeVisible ? '隐藏房间码' : '显示房间码'} title={codeVisible ? '隐藏房间码' : '显示房间码'}>{codeVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>}<button type="button" onClick={() => void copyCode()} aria-label="复制房间码" title="复制房间码"><Copy size={17} /></button></div>{copied && <small role="status">已复制</small>}</div></section>
      <section className="geo-room-roster"><header><div><UsersRound size={20} /><div><h2>等待玩家</h2><p>房主可在至少两人时开始对局。</p></div></div><span>{room.playerCount} / {room.maxPlayers}</span></header><div>{room.players.map((player) => <article key={player.user.id}><Avatar user={player.user} size="md" /><div><strong>{player.user.florrId}</strong><span>座位 {player.seat}</span></div>{player.user.id === room.hostId && <b><Crown size={14} />房主</b>}</article>)}</div></section>
      {error && <div className="page-error" role="alert"><span>{error}</span><button onClick={() => setError('')}>关闭</button></div>}
      <section className="geo-room-actions"><button className="button-secondary" disabled={busy} onClick={() => void leave()}>{isHost ? '关闭房间' : '退出房间'}</button>{isHost ? <button className="button-primary" disabled={busy || room.playerCount < 2} onClick={() => void start()}><Play size={17} />开始对局</button> : <span>等待房主开始...</span>}</section>
      <Link className="geo-room-back" to="/geo-hunt">返回图寻大厅</Link>
    </main>
  </div>
}
