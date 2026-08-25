import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Headphones, HeadphoneOff, LogOut, Mic, MicOff, Phone, PhoneOff, Radio, Send, UsersRound } from 'lucide-react'
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorDialog } from '../components/ErrorDialog'
import { api, getErrorMessage } from '../lib/api'
import { createEcho, keepEchoConnection, observeEchoConnection, type EchoConnectionStatus } from '../lib/echo'
import type { PublicMessage, PublicMessageCreatedEvent, PublicMessagePage, User, VoiceCredentials, VoiceParticipantPage } from '../types'

interface PublicRoomPageProps { user: User; onLogout: () => Promise<void> }
type VoiceState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

function sortMessages(messages: PublicMessage[]) {
  return [...new Map(messages.map((message) => [message.id, message])).values()].sort((a, b) => a.id - b.id).slice(-500)
}

export function PublicRoomPage({ user, onLogout }: PublicRoomPageProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [messageBody, setMessageBody] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [realtimeStatus, setRealtimeStatus] = useState<EchoConnectionStatus>('reconnecting')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [micMuted, setMicMuted] = useState(false)
  const [remoteMuted, setRemoteMuted] = useState(false)
  const [voiceUsers, setVoiceUsers] = useState<User[]>([])
  const [voiceRosterAvailable, setVoiceRosterAvailable] = useState(true)
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set())
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))
  const roomRef = useRef<Room | null>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const audioContainerRef = useRef<HTMLDivElement>(null)
  const remoteMutedRef = useRef(false)

  const loadMessages = useCallback(async (before?: number) => {
    const { data } = await api.get<PublicMessagePage>('/public-room/messages', { params: before ? { before } : undefined })
    setMessages((current) => sortMessages(before ? [...data.data, ...current] : data.data))
    setHasMore(data.meta.hasMore)
    setNextBefore(data.meta.nextBefore)
  }, [])

  const loadVoiceRoster = useCallback(async () => {
    try {
      const { data } = await api.get<VoiceParticipantPage>('/public-room/voice-participants')
      setVoiceUsers(data.data)
      setVoiceRosterAvailable(data.meta.available)
    } catch {
      setVoiceRosterAvailable(false)
    }
  }, [])

  // Initial room data is the remote synchronization owned by this effect.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    void Promise.all([loadMessages(), loadVoiceRoster()])
      .catch((requestError) => setError(getErrorMessage(requestError)))
      .finally(() => setLoading(false))
  }, [loadMessages, loadVoiceRoster])
  // oxlint-enable react/set-state-in-effect

  useEffect(() => {
    const channel = echo.private('public-room')
    channel.listen('.PublicMessageCreated', (event: PublicMessageCreatedEvent) => {
      setMessages((current) => sortMessages([...current, event.message]))
    })
    return () => { echo.leave('public-room'); echo.disconnect() }
  }, [echo])
  useEffect(() => observeEchoConnection(echo, setRealtimeStatus), [echo])
  useEffect(() => keepEchoConnection(echo), [echo])

  useEffect(() => {
    if (realtimeStatus === 'connected') return
    const interval = window.setInterval(() => void loadMessages().catch(() => undefined), 5000)
    return () => window.clearInterval(interval)
  }, [loadMessages, realtimeStatus])

  useEffect(() => {
    const interval = window.setInterval(() => void loadVoiceRoster(), 5000)
    return () => window.clearInterval(interval)
  }, [loadVoiceRoster])

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  useEffect(() => () => { roomRef.current?.disconnect() }, [])

  const loadOlder = async () => {
    if (!nextBefore || loadingOlder) return
    const list = messageListRef.current
    const previousHeight = list?.scrollHeight ?? 0
    setLoadingOlder(true)
    try {
      await loadMessages(nextBefore)
      requestAnimationFrame(() => { if (list) list.scrollTop = list.scrollHeight - previousHeight })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoadingOlder(false)
    }
  }

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = messageBody.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const { data } = await api.post<{ data: PublicMessage }>('/public-room/messages', { body })
      setMessages((current) => sortMessages([...current, data.data]))
      setMessageBody('')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSending(false)
    }
  }

  const refreshVoiceState = (room: Room) => {
    const identities = [room.localParticipant.identity, ...Array.from(room.remoteParticipants.values(), (participant) => participant.identity)]
    if (identities.includes(`user:${user.id}`)) {
      setVoiceUsers((current) => current.some((member) => member.id === user.id) ? current : [...current, user])
    }
    void loadVoiceRoster()
  }

  const joinVoice = async () => {
    if (voiceState === 'connecting' || voiceState === 'connected') return
    setVoiceState('connecting')
    setError('')
    try {
      const { data } = await api.post<{ data: VoiceCredentials }>('/public-room/voice-token')
      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio || !audioContainerRef.current) return
        const element = track.attach() as HTMLAudioElement
        element.muted = remoteMutedRef.current
        audioContainerRef.current.appendChild(element)
      })
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication) => track.detach().forEach((element) => element.remove()))
      room.on(RoomEvent.ParticipantConnected, () => refreshVoiceState(room))
      room.on(RoomEvent.ParticipantDisconnected, () => refreshVoiceState(room))
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => setActiveSpeakers(new Set(speakers.map((speaker) => speaker.identity))))
      room.on(RoomEvent.Reconnecting, () => setVoiceState('reconnecting'))
      room.on(RoomEvent.Reconnected, () => setVoiceState('connected'))
      room.on(RoomEvent.Disconnected, () => {
        setVoiceState('idle')
        setActiveSpeakers(new Set())
        void loadVoiceRoster()
      })
      await room.connect(data.data.serverUrl, data.data.token)
      try { await room.localParticipant.setMicrophoneEnabled(false) } catch { /* remain muted without permission */ }
      setMicMuted(true)
      setVoiceState('connected')
      refreshVoiceState(room)
    } catch (requestError) {
      roomRef.current?.disconnect()
      roomRef.current = null
      setVoiceState('error')
      setError(getErrorMessage(requestError))
    }
  }

  const leaveVoice = () => {
    roomRef.current?.disconnect()
    roomRef.current = null
    setVoiceState('idle')
    void loadVoiceRoster()
  }

  const toggleMic = async () => {
    const room = roomRef.current
    if (!room) return
    const nextMuted = !micMuted
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted)
      setMicMuted(nextMuted)
    } catch (requestError) {
      setMicMuted(true)
      setError(getErrorMessage(requestError))
    }
  }

  const toggleRemoteAudio = () => {
    const nextMuted = !remoteMuted
    remoteMutedRef.current = nextMuted
    audioContainerRef.current?.querySelectorAll('audio').forEach((audio) => { audio.muted = nextMuted })
    setRemoteMuted(nextMuted)
  }

  const voiceUsersById = useMemo(() => new Map(voiceUsers.map((member) => [member.id, member])), [voiceUsers])
  if (loading) return <div className="room-loading" role="status">正在进入公共房间...</div>

  return <div className="team-room-page public-room-page">
    {realtimeStatus === 'unavailable' && <div className="modal-backdrop realtime-overlay"><section className="modal" role="alertdialog" aria-modal="true"><h2>实时连接已断开</h2><p>公共聊天可能无法实时同步，正在通过轮询继续刷新。</p><button className="button-primary" type="button" onClick={() => window.location.reload()}>重试连接</button></section></div>}
    <header className="room-topbar">
      <div className="brand-lockup"><span>Movers Squad</span><small>公共房间</small></div>
      <nav className="main-nav room-main-nav" aria-label="主导航"><Link to="/">招募</Link><Link className="active" to="/public-room">公共</Link><Link to="/geo-hunt">图寻</Link></nav>
      <div className="room-topbar-actions"><button className="button-secondary public-back-button" type="button" onClick={() => navigate('/')}><ArrowLeft size={16} />返回大厅</button><span className="room-status"><i />公共频道</span><button className="button-secondary" type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>
    </header>

    <main className="room-shell">
      <aside className="room-sidebar">
        <header><div><span className="eyebrow">PUBLIC ROOM</span><h1>公共大厅</h1></div><strong>{voiceUsers.length}<small> 在线</small></strong></header>
        <p className="room-note">所有已登录用户均可参与聊天，并自由加入公共语音频道。</p>
        <section className="room-roster"><h2><UsersRound size={17} />语音成员</h2>{!voiceRosterAvailable ? <p className="public-roster-state">语音名单暂时不可用</p> : voiceUsers.length === 0 ? <p className="public-roster-state">当前无人加入语音</p> : voiceUsers.map((member) => <article key={member.id}><Avatar user={member} size="md" /><span><strong>{member.florrId}</strong><small><Radio size={11} />公共语音中</small></span></article>)}</section>
      </aside>

      <section className="room-conversation">
        <header className="conversation-header"><div><h2>公共聊天</h2><p>所有已登录用户可见，保留最近 500 条消息</p></div>{hasMore && <button className="button-secondary load-older" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? '载入中...' : '更早消息'}</button>}</header>
        <div className="message-list" ref={messageListRef} aria-live="polite">
          {messages.length === 0 ? <div className="chat-empty"><Send size={21} /><strong>开始公共交流</strong><span>发送第一条消息。</span></div> : messages.map((message) => {
            const own = message.sender.id === user.id
            return <article className={`chat-message ${own ? 'is-own' : ''}`} key={message.id}><Avatar user={message.sender} size="sm" /><div><span><strong>{message.sender.florrId}</strong><time>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></span><p>{message.body}</p></div></article>
          })}
        </div>
        <form className="message-composer" onSubmit={(event) => void sendMessage(event)}><textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={2000} rows={2} placeholder="输入消息" aria-label="消息内容" /><button className="button-primary" type="submit" disabled={sending || messageBody.trim() === ''} title="发送消息"><Send size={18} /></button></form>
      </section>

      <section className="voice-panel" aria-label="公共语音通话">
        <header><div><h2>公共语音</h2><p>{voiceState === 'connected' ? '通话已连接' : voiceState === 'connecting' ? '正在连接...' : voiceState === 'reconnecting' ? '正在重连...' : voiceState === 'error' ? '连接失败' : '尚未加入'}</p></div><span className={`voice-dot voice-${voiceState}`} /></header>
        <div className="voice-participants">{voiceUsers.length === 0 ? <div className="voice-empty"><Headphones size={22} /><span>加入公共语音与其他用户通话</span></div> : voiceUsers.map((member) => <div className={activeSpeakers.has(`user:${member.id}`) ? 'is-speaking' : ''} key={member.id}><Avatar user={voiceUsersById.get(member.id) ?? member} size="sm" /><span>{member.florrId}</span></div>)}</div>
        <div className="voice-controls">{voiceState === 'connected' || voiceState === 'reconnecting' ? <><button className="icon-button" type="button" onClick={() => void toggleMic()} title={micMuted ? '解除静音' : '麦克风静音'}>{micMuted ? <MicOff size={18} /> : <Mic size={18} />}</button><button className="icon-button" type="button" onClick={toggleRemoteAudio} title={remoteMuted ? '恢复其他成员声音' : '静音其他成员声音'}>{remoteMuted ? <HeadphoneOff size={18} /> : <Headphones size={18} />}</button><button className="voice-leave" type="button" onClick={leaveVoice} title="退出语音"><PhoneOff size={18} /></button></> : <button className="button-primary voice-join" type="button" disabled={voiceState === 'connecting'} onClick={() => void joinVoice()}><Phone size={18} />{voiceState === 'connecting' ? '连接中...' : '加入语音'}</button>}</div>
      </section>
    </main>
    <div ref={audioContainerRef} className="remote-audio" aria-hidden="true" />
    <ErrorDialog message={error} onClose={() => setError('')} />
  </div>
}
