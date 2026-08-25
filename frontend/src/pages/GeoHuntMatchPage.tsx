import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Clock3, LogOut, RotateCcw, Swords, WifiOff } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { GeoHuntMapCanvas } from '../components/GeoHuntMapCanvas'
import { api, getErrorMessage } from '../lib/api'
import { createEcho, observeEchoConnection, type EchoConnectionStatus } from '../lib/echo'
import { decodeGeoHuntMap, secondsRemaining } from '../lib/geoHunt'
import type { GeoHuntMap, GeoHuntMapPayload, GeoHuntMatchState, User } from '../types'
import './GeoHunt.css'

interface Props { user: User; onLogout: () => Promise<void> }
type MobileView = 'snippet' | 'map'
const mapCache = new Map<string, Promise<GeoHuntMap>>()

function loadMap(key: string): Promise<GeoHuntMap> {
  const cached = mapCache.get(key)
  if (cached) return cached
  const request = api.get<{ data: GeoHuntMapPayload }>(`/geo-hunt/maps/${key}`)
    .then(({ data }) => decodeGeoHuntMap(data.data))
  mapCache.set(key, request)
  request.catch(() => mapCache.delete(key))
  return request
}

export function GeoHuntMatchPage({ user, onLogout }: Props) {
  const navigate = useNavigate()
  const matchId = Number(useParams().matchId)
  const [state, setState] = useState<GeoHuntMatchState | null>(null)
  const [map, setMap] = useState<GeoHuntMap | null>(null)
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [mobileView, setMobileView] = useState<MobileView>('snippet')
  const [confirmExit, setConfirmExit] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<EchoConnectionStatus>('reconnecting')
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))

  const loadState = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: GeoHuntMatchState }>(`/geo-hunt/matches/${matchId}`)
      setState(data.data)
      setError('')
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }, [matchId])

  useEffect(() => { if (Number.isInteger(matchId) && matchId > 0) void loadState(); else navigate('/geo-hunt', { replace: true }) }, [loadState, matchId, navigate])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => {
    const interval = window.setInterval(() => void loadState(), connectionStatus === 'connected' ? 60_000 : 3_000)
    const heartbeat = window.setInterval(() => api.post(`/geo-hunt/matches/${matchId}/heartbeat`).then(({ data }) => setState(data.data)).catch(() => undefined), 10_000)
    return () => { window.clearInterval(interval); window.clearInterval(heartbeat) }
  }, [connectionStatus, loadState, matchId])
  useEffect(() => {
    const stopObserving = observeEchoConnection(echo, setConnectionStatus)
    const channel = echo.private(`geo-hunt.match.${matchId}`)
    channel.listen('.GeoHuntStateChanged', () => void loadState())
    return () => { stopObserving(); echo.leave(`geo-hunt.match.${matchId}`); echo.disconnect() }
  }, [echo, loadState, matchId])
  useEffect(() => {
    const key = state?.round?.mapKey
    if (!key) return
    let active = true
    loadMap(key).then((loadedMap) => { if (active) setMap(loadedMap) }).catch((requestError) => setError(getErrorMessage(requestError)))
    setMarker(null)
    setMobileView('snippet')
    return () => { active = false }
  }, [state?.round?.id, state?.round?.mapKey])
  useEffect(() => {
    if (!state?.roomName) return
    const previous = document.title
    document.title = `${state.roomName} | 图寻 | Movers Squad`
    return () => { document.title = previous }
  }, [state?.roomName])

  const seconds = secondsRemaining(state?.round?.deadlineAt, now)
  const resultMarkers = useMemo(() => {
    const result = state?.round?.result
    if (!result || !state) return []
    const names = new Map(state.players.map((player) => [player.user.id, player.user.florrId]))
    return [
      { ...result.target, color: '#16865d', label: '正确位置' },
      ...result.guesses.filter((guess) => guess.x !== null && guess.y !== null).map((guess) => ({ x: guess.x!, y: guess.y!, color: guess.userId === user.id ? '#2f6edb' : '#c83d4f', label: guess.userId === user.id ? '你的落点' : names.get(guess.userId) ?? '其他玩家' })),
    ]
  }, [state, user.id])

  const submitGuess = async () => {
    if (!marker || busy) return
    setBusy(true)
    try {
      const { data } = await api.post<{ data: GeoHuntMatchState }>(`/geo-hunt/matches/${matchId}/guess`, marker)
      setState(data.data)
    } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setBusy(false) }
  }

  const forfeit = async () => {
    setBusy(true)
    try {
      const { data } = await api.post<{ data: GeoHuntMatchState }>(`/geo-hunt/matches/${matchId}/forfeit`)
      setState(data.data)
      setConfirmExit(false)
    } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setBusy(false) }
  }

  const rematch = async () => {
    setBusy(true)
    try {
      const { data } = await api.post<{ data: { queued: boolean; matchId: number | null } }>('/geo-hunt/queue')
      navigate(data.data.matchId ? `/geo-hunt/matches/${data.data.matchId}` : '/geo-hunt')
    } catch (requestError) { setError(getErrorMessage(requestError)); setBusy(false) }
  }

  if (!state) return <div className="room-loading" role="status">正在恢复图寻对局...</div>
  const isReveal = state.status === 'reveal' || state.status === 'finished'
  const won = state.winnerId === user.id
  const ownResult = state.round?.result?.guesses.find((guess) => guess.userId === user.id)
  const rankedOpponent = state.players.find((player) => player.user.id !== user.id)
  const isCustom = state.mode !== 'ranked_1v1'

  return <div className="geo-page geo-match-page">
    <header className="room-topbar geo-topbar">
      <div className="brand-lockup"><span>Movers Squad</span><small>{state.roomName ?? '图寻对决'}</small></div>
      <div className="geo-round-label">第 {state.round?.number ?? 0} 回合{state.round && state.round.multiplier > 1 ? ` · ${state.round.multiplier}× 伤害` : ''}</div>
      <div className="room-topbar-actions"><button className="button-secondary geo-forfeit-button" type="button" aria-label="退出对局" onClick={() => setConfirmExit(true)} disabled={state.status === 'finished' || state.self.eliminated}><ArrowLeft size={16} /><span>退出对局</span></button><button className="button-secondary" type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>
    </header>

    <main className="geo-duel-shell">
      {isCustom && <section className="geo-match-room-title"><div><span>{state.mode === 'admin_public' ? '管理员多人房' : '私人对局'}</span><h1>{state.roomName ?? `私人对局 · ${state.roomCode}`}</h1></div><strong>{state.players.filter((player) => !player.eliminated).length} 人存活</strong></section>}
      {isCustom ? <><div className={`geo-timer geo-multi-timer${seconds <= 10 && state.status === 'playing' ? ' is-urgent' : ''}`} role="timer"><Clock3 size={18} /><strong>{state.status === 'playing' ? seconds : state.status === 'reveal' ? '结算' : '结束'}</strong></div><section className="geo-player-grid" aria-label="玩家生命值">{state.players.map((player) => <PlayerTile key={player.user.id} player={player} self={player.user.id === user.id} />)}</section></> : <section className="geo-scoreboard" aria-label="双方生命值"><PlayerBar player={state.self} side="self" /><div className={`geo-timer${seconds <= 10 && state.status === 'playing' ? ' is-urgent' : ''}`} role="timer"><Clock3 size={18} /><strong>{state.status === 'playing' ? seconds : state.status === 'reveal' ? '结算' : '结束'}</strong></div>{rankedOpponent && <PlayerBar player={rankedOpponent} side="opponent" />}</section>}

      {state.players.some((player) => player.user.id !== user.id && !player.connected && !player.eliminated) && state.status !== 'finished' && <div className="geo-connection-warning" role="status"><WifiOff size={17} />有玩家连接中断，正在等待 30 秒重连。</div>}
      {error && <div className="page-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadState()}>重试</button></div>}

      {state.status === 'finished' ? <section className={`geo-settlement ${won ? 'is-win' : 'is-loss'}`}>
        <div className="geo-settlement-mark"><Swords size={38} /></div><span>{won ? 'VICTORY' : state.winnerId ? 'DEFEAT' : 'ROOM CLOSED'}</span><h1>{state.endedReason === 'admin_closed' ? '房间已由管理员关闭' : state.endedReason === 'host_closed' ? '房主已关闭房间' : won ? '对决胜利' : '本局落败'}</h1><p>{state.endedReason === 'knockout' ? '生命值归零' : state.endedReason === 'forfeit' ? '有玩家主动退出' : state.endedReason === 'disconnect' ? '有玩家断线超时' : '本局不会计入经验和战绩'}</p>
        {isCustom ? <div className="geo-final-ranking">{[...state.players].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99)).map((player) => <div key={player.user.id}><b>#{player.placement ?? '-'}</b><Avatar user={player.user} size="sm" /><strong>{player.user.florrId}</strong><span>{player.hp} HP</span></div>)}</div> : <div className="geo-settlement-stats"><div><span>回合</span><strong>{state.round?.number ?? 0}</strong></div><div><span>获得经验</span><strong>+{state.self.xpAwarded} XP</strong></div><div><span>当前等级</span><strong>Lv.{state.profile.level}</strong></div></div>}
        <div className="geo-settlement-actions">{!isCustom && <button className="button-primary" type="button" disabled={busy} onClick={() => void rematch()}><RotateCcw size={17} />再次匹配</button>}<Link className="button-secondary" to="/geo-hunt">返回图寻大厅</Link></div>
      </section> : map && state.round ? <>
        <div className="geo-mobile-tabs" role="tablist" aria-label="地图视图"><button className={mobileView === 'snippet' ? 'active' : ''} type="button" role="tab" onClick={() => setMobileView('snippet')}>目标</button><button className={mobileView === 'map' ? 'active' : ''} type="button" role="tab" onClick={() => setMobileView('map')}>全图</button></div>
        <section className={`geo-board${isReveal ? ' is-reveal' : ''}`}>
          <article className={`geo-snippet-panel${mobileView !== 'snippet' ? ' is-mobile-hidden' : ''}`}><header><div><span>目标区域</span><h2>{isReveal ? '位置已公布' : '这是哪里？'}</h2></div><small>仅显示图块层</small></header><div className="geo-canvas-frame snippet"><GeoHuntMapCanvas map={map} snippet={state.round.snippet} ariaLabel="需要在全图中定位的目标地图切片" /></div></article>
          <article className={`geo-map-panel${mobileView !== 'map' ? ' is-mobile-hidden' : ''}`}><header><div><span>完整地图</span><h2>{isReveal ? '回合结果' : '选择目标位置'}</h2></div><small>{isReveal ? '绿色为正确位置' : '拖动、缩放并点击落点'}</small></header><div className="geo-canvas-frame full"><GeoHuntMapCanvas map={map} marker={!isReveal ? marker : null} resultMarkers={resultMarkers} interactive={!isReveal && !state.round.submitted} onMarkerChange={setMarker} ariaLabel="可选择落点的完整地图" /></div></article>
        </section>
        {isReveal && state.round.result ? isCustom ? <section className="geo-multi-result" aria-live="polite">{[...state.round.result.guesses].sort((a, b) => b.score - a.score).map((guess) => { const player = state.players.find((item) => item.user.id === guess.userId); return <div key={guess.userId}><strong>{player?.user.florrId ?? '玩家'}</strong><b>{guess.score.toLocaleString()} 分</b><span>{guess.distanceTiles == null ? '未提交' : `${guess.distanceTiles.toFixed(1)} 格`} · -{guess.damageTaken} HP</span></div> })}</section> : <section className="geo-round-result" aria-live="polite"><ResultCell label="你" score={ownResult?.score ?? 0} distance={ownResult?.distanceTiles} /><div className="geo-damage"><strong>{state.round.result.damage}</strong><span>本回合伤害</span></div><ResultCell label="对手" score={state.round.result.guesses.find((guess) => guess.userId !== user.id)?.score ?? 0} distance={state.round.result.guesses.find((guess) => guess.userId !== user.id)?.distanceTiles} /></section> : <section className="geo-submit-bar"><div><strong>{state.self.eliminated ? '你已被淘汰，正在观战' : state.round.submitted ? '已锁定落点' : marker ? '落点已选择' : '请在完整地图中选择位置'}</strong><span>{state.round.submitted ? `等待其他玩家（${state.round.submittedCount}/${state.round.requiredGuesses}）` : '确认后无法修改。'}</span></div><button className="button-primary" type="button" disabled={!marker || busy || state.round.submitted || state.self.eliminated} onClick={() => void submitGuess()}><Check size={18} />{state.round.submitted ? '已提交' : '确认落点'}</button></section>}
      </> : <div className="room-loading">正在载入地图...</div>}
    </main>

    {confirmExit && <div className="modal-backdrop"><section className="modal geo-exit-modal" role="alertdialog" aria-modal="true" aria-labelledby="geo-exit-title"><h2 id="geo-exit-title">退出将立即判负</h2><p>主动退出不会获得失败经验，本局对手直接获胜。</p><div><button className="button-secondary" type="button" onClick={() => setConfirmExit(false)}>继续对局</button><button className="button-danger" type="button" disabled={busy} onClick={() => void forfeit()}>确认退出</button></div></section></div>}
  </div>
}

function PlayerBar({ player, side }: { player: GeoHuntMatchState['self']; side: 'self' | 'opponent' }) {
  const percent = Math.max(0, Math.min(100, (player.hp / 6000) * 100))
  return <div className={`geo-player-bar ${side}`}><Avatar user={player.user} size="sm" /><div><span><strong>{side === 'self' ? '你' : player.user.florrId}</strong><b>{player.hp} HP</b></span><i><em style={{ width: `${percent}%` }} /></i></div></div>
}

function PlayerTile({ player, self }: { player: GeoHuntMatchState['self']; self: boolean }) {
  const percent = Math.max(0, Math.min(100, (player.hp / 6000) * 100))
  return <article className={`${self ? 'is-self' : ''}${player.eliminated ? ' is-eliminated' : ''}`}><Avatar user={player.user} size="sm" /><div><span><strong>{self ? `${player.user.florrId}（你）` : player.user.florrId}</strong><b>{player.eliminated ? '已淘汰' : `${player.hp} HP`}</b></span><i><em style={{ width: `${percent}%` }} /></i></div></article>
}

function ResultCell({ label, score, distance }: { label: string; score: number; distance?: number | null }) {
  return <div><span>{label}</span><strong>{score.toLocaleString()} 分</strong><small>{distance == null ? '未提交' : `${distance.toFixed(1)} 格`}</small></div>
}
