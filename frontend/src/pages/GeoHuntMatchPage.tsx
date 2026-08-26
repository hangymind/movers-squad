import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Clock3, Eye, Gauge, LogOut, MapPinned, RotateCcw, Skull, Swords, Target, UsersRound, WifiOff, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { GeoHuntMapCanvas } from '../components/GeoHuntMapCanvas'
import { api, getErrorMessage } from '../lib/api'
import { createEcho, observeEchoConnection, type EchoConnectionStatus } from '../lib/echo'
import { decodeGeoHuntMap, secondsRemaining } from '../lib/geoHunt'
import type { GeoHuntMap, GeoHuntMapPayload, GeoHuntMatchState, User } from '../types'
import './GeoHunt.css'

interface Props { user: User; onLogout: () => Promise<void> }
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
  const [showSnippet, setShowSnippet] = useState(true)
  const [showPlayers, setShowPlayers] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [lowDetail, setLowDetail] = useState(true)
  const [eliminationNotice, setEliminationNotice] = useState<number | null>(null)
  const previousEliminatedRef = useRef(new Set<number>())
  const eliminationBaselineReadyRef = useRef(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<EchoConnectionStatus>('reconnecting')
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))
  const currentMatchIdRef = useRef(matchId)
  const refreshInFlightRef = useRef<{ matchId: number; request: Promise<void> } | null>(null)

  const refreshState = useCallback((heartbeat = false): Promise<void> => {
    if (refreshInFlightRef.current?.matchId === matchId) return refreshInFlightRef.current.request

    const request = (heartbeat
      ? api.post<{ data: GeoHuntMatchState }>(`/geo-hunt/matches/${matchId}/heartbeat`)
      : api.get<{ data: GeoHuntMatchState }>(`/geo-hunt/matches/${matchId}`))
      .then(({ data }) => {
        if (currentMatchIdRef.current !== matchId) return
        setState(data.data)
        setError('')
      })
      .catch((requestError) => {
        if (!heartbeat && currentMatchIdRef.current === matchId) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (refreshInFlightRef.current?.request === request) refreshInFlightRef.current = null
      })

    refreshInFlightRef.current = { matchId, request }
    return request
  }, [matchId])

  const loadState = useCallback(() => refreshState(false), [refreshState])

  useEffect(() => { currentMatchIdRef.current = matchId }, [matchId])
  useEffect(() => { if (Number.isInteger(matchId) && matchId > 0) void loadState(); else navigate('/geo-hunt', { replace: true }) }, [loadState, matchId, navigate])
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => {
    const interval = window.setInterval(() => void loadState(), connectionStatus === 'connected' ? 60_000 : 3_000)
    const heartbeat = window.setInterval(() => void refreshState(true), 10_000)
    return () => { window.clearInterval(interval); window.clearInterval(heartbeat) }
  }, [connectionStatus, loadState, refreshState])
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
    setShowSnippet(true)
    setShowResult(false)
    return () => { active = false }
  }, [state?.round?.id, state?.round?.mapKey])
  useEffect(() => {
    if (!state) return
    const eliminated = new Set(state.players.filter((player) => player.eliminated).map((player) => player.user.id))
    const newlyEliminated = [...eliminated].find((id) => !previousEliminatedRef.current.has(id))
    if (eliminationBaselineReadyRef.current && newlyEliminated !== undefined) setEliminationNotice(newlyEliminated)
    previousEliminatedRef.current = eliminated
    eliminationBaselineReadyRef.current = true
  }, [state?.stateVersion, state])
  useEffect(() => {
    if (state?.status !== 'reveal') return
    const timeout = window.setTimeout(() => setShowResult(true), 1200)
    return () => window.clearTimeout(timeout)
  }, [state?.round?.id, state?.status])
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
  const eliminatedPlayer = state.players.find((player) => player.user.id === eliminationNotice)
  const eliminatedGuess = state.round?.result?.guesses.find((guess) => guess.userId === eliminationNotice)
  const aliveCount = state.players.filter((player) => !player.eliminated).length

  return <div className="geo-page geo-match-page">
    <header className="room-topbar geo-topbar">
      <div className="brand-lockup"><span>Movers Squad</span><small>{state.roomName ?? '图寻对决'}</small></div>
      <div className="geo-round-label">第 {state.round?.number ?? 0} 回合{state.round && state.round.multiplier > 1 ? ` · ${state.round.multiplier}× 伤害` : ''}</div>
      <div className="room-topbar-actions"><label className="geo-performance-toggle" title="关闭后加载并显示完整地图画面"><Gauge size={16} /><span>低配模式</span><input type="checkbox" role="switch" checked={lowDetail} onChange={(event) => setLowDetail(event.target.checked)} /></label><button className="button-secondary geo-forfeit-button" type="button" aria-label="退出对局" onClick={() => setConfirmExit(true)} disabled={state.status === 'finished' || state.self.eliminated}><ArrowLeft size={16} /><span>退出对局</span></button><button className="button-secondary" type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>
    </header>

    <main className="geo-duel-shell">
      {map && state.round ? <section className={`geo-map-stage${isReveal ? ' is-reveal' : ''}`}>
        <div className="geo-stage-map"><GeoHuntMapCanvas map={map} marker={!isReveal ? marker : null} resultMarkers={resultMarkers} interactive={!isReveal && !state.round.submitted && !state.self.eliminated} lowDetail={lowDetail} onMarkerChange={setMarker} ariaLabel={lowDetail ? '可拖动、缩放并选择落点的简化墙体地图' : '可拖动、缩放并选择落点的完整地图'} /></div>

        <div className="geo-stage-hud">
          <button className="geo-hud-button" type="button" onClick={() => setShowSnippet(true)} aria-label="查看目标区域"><Target size={18} /><span>目标</span></button>
          <div className={`geo-timer${seconds <= 10 && state.status === 'playing' ? ' is-urgent' : ''}`} role="timer"><Clock3 size={18} /><strong>{state.status === 'playing' ? seconds : state.status === 'reveal' ? '结算' : '结束'}</strong></div>
          <button className="geo-hud-button" type="button" onClick={() => setShowPlayers(true)} aria-label="查看玩家状态"><UsersRound size={18} /><span>{isCustom ? `${aliveCount} 存活` : '玩家'}</span></button>
        </div>

        {!isCustom && <section className="geo-scoreboard geo-scoreboard-overlay" aria-label="双方生命值"><PlayerBar player={state.self} side="self" />{rankedOpponent && <PlayerBar player={rankedOpponent} side="opponent" />}</section>}
        {isCustom && <div className="geo-room-overlay"><strong>{state.roomName ?? `房间 ${state.roomCode}`}</strong><span>第 {state.round.number} 回合 · {aliveCount} 人存活</span></div>}

        {state.players.some((player) => player.user.id !== user.id && !player.connected && !player.eliminated) && state.status !== 'finished' && <div className="geo-connection-warning" role="status"><WifiOff size={17} />有玩家断线，等待重连</div>}
        {error && <div className="page-error geo-stage-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadState()}>重试</button></div>}

        {state.status !== 'finished' && !isReveal && <section className="geo-submit-bar"><div><strong>{state.self.eliminated ? '你已被淘汰，正在观战' : state.round.submitted ? '落点已锁定' : marker ? '落点已选择' : '点击地图选择位置'}</strong><span>{state.round.submitted ? `等待其他玩家（${state.round.submittedCount}/${state.round.requiredGuesses}）` : '可拖动地图，滚轮或双指缩放。'}</span></div><button className="button-primary" type="button" disabled={!marker || busy || state.round.submitted || state.self.eliminated} onClick={() => void submitGuess()}><Check size={18} />{state.round.submitted ? '已提交' : '确认落点'}</button></section>}
        {isReveal && state.status !== 'finished' && <button className="geo-result-trigger" type="button" onClick={() => setShowResult(true)}><MapPinned size={17} />查看本回合详情</button>}

        {showSnippet && state.status === 'playing' && <div className="geo-floating-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setShowSnippet(false) }}><section className="geo-floating-panel geo-target-window" role="dialog" aria-modal="true" aria-labelledby="geo-target-title"><header><div><span>目标区域</span><h2 id="geo-target-title">这是哪里？</h2></div><button type="button" onClick={() => setShowSnippet(false)} aria-label="关闭目标窗口"><X size={19} /></button></header><div className="geo-canvas-frame snippet"><GeoHuntMapCanvas map={map} snippet={state.round.snippet} lowDetail={lowDetail} ariaLabel={lowDetail ? '需要在全图中定位的简化墙体切片' : '需要在全图中定位的目标地图切片'} /></div><button className="button-primary" type="button" onClick={() => setShowSnippet(false)}><Eye size={17} />开始定位</button></section></div>}
        {showPlayers && <div className="geo-floating-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setShowPlayers(false) }}><section className="geo-floating-panel geo-players-window" role="dialog" aria-modal="true" aria-labelledby="geo-players-title"><header><div><span>对局状态</span><h2 id="geo-players-title">玩家与生命值</h2></div><button type="button" onClick={() => setShowPlayers(false)} aria-label="关闭玩家窗口"><X size={19} /></button></header><div className="geo-player-grid" aria-label="玩家生命值">{state.players.map((player) => <PlayerTile key={player.user.id} player={player} self={player.user.id === user.id} />)}</div></section></div>}
        {showResult && isReveal && state.round.result && state.status !== 'finished' && <div className="geo-floating-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setShowResult(false) }}><section className="geo-floating-panel geo-result-window" role="dialog" aria-modal="true" aria-labelledby="geo-result-title"><header><div><span>第 {state.round.number} 回合</span><h2 id="geo-result-title">落点与伤害结算</h2></div><button type="button" onClick={() => setShowResult(false)} aria-label="关闭结算窗口"><X size={19} /></button></header>{isCustom ? <section className="geo-multi-result" aria-live="polite">{[...state.round.result.guesses].sort((a, b) => b.score - a.score).map((guess) => { const player = state.players.find((item) => item.user.id === guess.userId); return <div key={guess.userId}><strong>{player?.user.florrId ?? '玩家'}</strong><b>{guess.score.toLocaleString()} 分</b><span>{guess.distanceTiles == null ? '未提交' : `${guess.distanceTiles.toFixed(1)} 格`} · -{guess.damageTaken} HP</span></div> })}</section> : <section className="geo-round-result" aria-live="polite"><ResultCell label="你" score={ownResult?.score ?? 0} distance={ownResult?.distanceTiles} /><div className="geo-damage"><strong>{state.round.result.damage}</strong><span>本回合伤害</span></div><ResultCell label="对手" score={state.round.result.guesses.find((guess) => guess.userId !== user.id)?.score ?? 0} distance={state.round.result.guesses.find((guess) => guess.userId !== user.id)?.distanceTiles} /></section>}</section></div>}

        {state.status === 'finished' && <div className="geo-settlement-backdrop"><section className={`geo-settlement ${won ? 'is-win' : 'is-loss'}`}>
        <div className="geo-settlement-mark"><Swords size={38} /></div><span>{won ? 'VICTORY' : state.winnerId ? 'DEFEAT' : 'ROOM CLOSED'}</span><h1>{state.endedReason === 'admin_closed' ? '房间已由管理员关闭' : state.endedReason === 'host_closed' ? '房主已关闭房间' : won ? '对决胜利' : '本局落败'}</h1><p>{state.endedReason === 'knockout' ? '生命值归零' : state.endedReason === 'forfeit' ? '有玩家主动退出' : state.endedReason === 'disconnect' ? '有玩家断线超时' : '本局不会计入经验和战绩'}</p>
        {isCustom ? <div className="geo-final-ranking">{[...state.players].sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99)).map((player) => <div key={player.user.id}><b>#{player.placement ?? '-'}</b><Avatar user={player.user} size="sm" /><strong>{player.user.florrId}</strong><span>{player.hp} HP</span></div>)}</div> : <div className="geo-settlement-stats"><div><span>回合</span><strong>{state.round?.number ?? 0}</strong></div><div><span>获得经验</span><strong>+{state.self.xpAwarded} XP</strong></div><div><span>当前等级</span><strong>Lv.{state.profile.level}</strong></div></div>}
        <div className="geo-settlement-actions">{!isCustom && <button className="button-primary" type="button" disabled={busy} onClick={() => void rematch()}><RotateCcw size={17} />再次匹配</button>}<Link className="button-secondary" to="/geo-hunt">返回图寻大厅</Link></div>
        </section></div>}
      </section> : state.status === 'finished' ? <section className="geo-map-stage geo-map-stage-empty"><div className="geo-settlement-backdrop"><section className={`geo-settlement ${won ? 'is-win' : 'is-loss'}`}><div className="geo-settlement-mark"><Swords size={38} /></div><span>{won ? 'VICTORY' : state.winnerId ? 'DEFEAT' : 'ROOM CLOSED'}</span><h1>{state.endedReason === 'admin_closed' ? '房间已由管理员关闭' : state.endedReason === 'host_closed' ? '房主已关闭房间' : won ? '对决胜利' : '本局落败'}</h1><p>{state.endedReason === 'forfeit' ? '有玩家主动退出' : state.endedReason === 'disconnect' ? '有玩家断线超时' : '本局没有可显示的地图结果'}</p><div className="geo-settlement-actions"><Link className="button-secondary" to="/geo-hunt">返回图寻大厅</Link></div></section></div></section> : <div className="room-loading">正在载入地图...</div>}
    </main>

    {eliminatedPlayer && <div className="geo-elimination-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="geo-elimination-title"><section className="geo-elimination-card"><div className="geo-elimination-icon"><Skull size={34} /></div><span>{eliminatedPlayer.user.id === user.id ? 'YOU WERE ELIMINATED' : 'PLAYER ELIMINATED'}</span><h2 id="geo-elimination-title">{eliminatedPlayer.user.id === user.id ? '你的生命值归零' : `${eliminatedPlayer.user.florrId} 已淘汰`}</h2><div className="geo-elimination-cause"><div><span>落点误差</span><strong>{eliminatedGuess?.distanceTiles == null ? '未提交' : `${eliminatedGuess.distanceTiles.toFixed(1)} 格`}</strong></div><div><span>本回合承伤</span><strong>-{eliminatedGuess?.damageTaken ?? state.round?.result?.damage ?? 0} HP</strong></div><div><span>剩余生命</span><strong>0 HP</strong></div></div><p>{eliminatedGuess?.timedOut ? '本回合未在时限内提交，按最低分结算。' : '你的落点距离正确位置更远，因此受到本回合伤害。'}</p><button className="button-primary" type="button" onClick={() => setEliminationNotice(null)}>{eliminatedPlayer.user.id === user.id && state.status !== 'finished' ? '继续观战' : '查看结果'}</button></section></div>}

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
