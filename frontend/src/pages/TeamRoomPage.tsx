import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Crown, Headphones, HeadphoneOff, LogOut, Mic, MicOff, Phone, PhoneOff, Send, UsersRound, XCircle } from 'lucide-react'
import { Room, RoomEvent, Track, type Participant, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ErrorDialog } from '../components/ErrorDialog'
import { api, getErrorMessage } from '../lib/api'
import { createEcho, keepEchoConnection, observeEchoConnection } from '../lib/echo'
import type { MessagePage, Team, TeamClosedEvent, TeamMemberLeftEvent, TeamMessage, TeamMessageCreatedEvent, User, VoiceCredentials } from '../types'

interface TeamRoomPageProps { user: User; onLogout: () => Promise<void> }
type VoiceState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

function sortMessages(messages: TeamMessage[]) {
  return [...new Map(messages.map((message) => [message.id, message])).values()].sort((a, b) => a.id - b.id)
}

export function TeamRoomPage({ user, onLogout }: TeamRoomPageProps) {
  const { teamId: teamIdParam } = useParams()
  const teamId = Number(teamIdParam)
  const navigate = useNavigate()
  const [team, setTeam] = useState<Team | null>(null)
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [messageBody, setMessageBody] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState('')
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [micMuted, setMicMuted] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [remoteMuted, setRemoteMuted] = useState(false)
  const [voiceParticipants, setVoiceParticipants] = useState<Participant[]>([])
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set())
  const [echo] = useState(() => createEcho(user.reverbKey ?? 'movers-local-key'))
  const roomRef = useRef<Room | null>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const audioContainerRef = useRef<HTMLDivElement>(null)
  const remoteMutedRef = useRef(false)

  const loadTeam = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Team }>(`/teams/${teamId}`)
      setTeam(data.data)
    } catch {
      navigate('/', { replace: true })
    }
  }, [navigate, teamId])

  const loadMessages = useCallback(async (before?: number) => {
    const { data } = await api.get<MessagePage>(`/teams/${teamId}/messages`, { params: before ? { before } : undefined })
    setMessages((current) => sortMessages(before ? [...data.data, ...current] : data.data))
    setHasMore(data.meta.hasMore)
    setNextBefore(data.meta.nextBefore)
  }, [teamId])

  useEffect(() => {
    if (!Number.isInteger(teamId) || teamId < 1) { navigate('/', { replace: true }); return }
    // Loading the protected room is the external synchronization owned by this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void Promise.all([loadTeam(), loadMessages()]).catch((requestError) => {
      setError(getErrorMessage(requestError))
      navigate('/', { replace: true })
    })
  }, [loadMessages, loadTeam, navigate, teamId])

  useEffect(() => {
    const channel = echo.private(`team.${teamId}`)
    channel.listen('.TeamMessageCreated', (event: TeamMessageCreatedEvent) => {
      setMessages((current) => sortMessages([...current, event.message]))
    })
    channel.listen('.TeamMemberLeft', (event: TeamMemberLeftEvent) => {
      if (event.user.id === user.id) navigate('/', { replace: true })
      else void loadTeam()
    })
    channel.listen('.TeamClosed', (_event: TeamClosedEvent) => {
      roomRef.current?.disconnect()
      navigate('/', { replace: true })
    })
    return () => { echo.leave(`team.${teamId}`); echo.disconnect() }
  }, [echo, loadTeam, navigate, teamId, user.id])
  useEffect(() => observeEchoConnection(echo, setRealtimeConnected), [echo])
  useEffect(() => keepEchoConnection(echo), [echo])

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  useEffect(() => {
    const lastMessage = messages.at(-1)
    if (!lastMessage) return
    const timer = window.setTimeout(() => {
      void api.post(`/teams/${teamId}/messages/read`, { lastMessageId: lastMessage.id }).catch(() => undefined)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [messages, teamId])

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
      const { data } = await api.post<{ data: TeamMessage }>(`/teams/${teamId}/messages`, { body })
      setMessages((current) => sortMessages([...current, data.data]))
      setMessageBody('')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSending(false)
    }
  }

  const refreshVoiceParticipants = (room: Room) => {
    setVoiceParticipants([room.localParticipant, ...room.remoteParticipants.values()])
  }

  const joinVoice = async () => {
    if (voiceState === 'connecting' || voiceState === 'connected') return
    setVoiceState('connecting')
    setError('')
    try {
      const { data } = await api.post<{ data: VoiceCredentials }>(`/teams/${teamId}/voice-token`)
      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio || !audioContainerRef.current) return
        const element = track.attach() as HTMLAudioElement
        element.muted = remoteMutedRef.current
        audioContainerRef.current.appendChild(element)
      })
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication) => track.detach().forEach((element) => element.remove()))
      room.on(RoomEvent.ParticipantConnected, () => refreshVoiceParticipants(room))
      room.on(RoomEvent.ParticipantDisconnected, () => refreshVoiceParticipants(room))
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => setActiveSpeakers(new Set(speakers.map((speaker) => speaker.identity))))
      room.on(RoomEvent.Reconnecting, () => setVoiceState('reconnecting'))
      room.on(RoomEvent.Reconnected, () => setVoiceState('connected'))
      room.on(RoomEvent.Disconnected, () => { setVoiceState('idle'); setVoiceParticipants([]); setActiveSpeakers(new Set()) })
      await room.connect(data.data.serverUrl, data.data.token)
      try { await room.localParticipant.setMicrophoneEnabled(false) } catch { /* remain muted if permission is unavailable */ }
      refreshVoiceParticipants(room)
      setMicMuted(true)
      setVoiceState('connected')
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
  }

  const toggleMic = async () => {
    const room = roomRef.current
    if (!room) return
    const nextMuted = !micMuted
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted)
      setMicMuted(nextMuted)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  const toggleRemoteAudio = () => {
    const nextMuted = !remoteMuted
    remoteMutedRef.current = nextMuted
    audioContainerRef.current?.querySelectorAll('audio').forEach((audio) => { audio.muted = nextMuted })
    setRemoteMuted(nextMuted)
  }

  const endMembership = async () => {
    if (!team) return
    try {
      if (team.owner.id === user.id) await api.post(`/teams/${team.id}/close`)
      else await api.delete(`/teams/${team.id}/members/me`)
      leaveVoice()
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  const memberByIdentity = useMemo(() => new Map((team?.members ?? []).map((member) => [`user:${member.id}`, member])), [team])
  if (!team) return <div className="room-loading" role="status">正在进入队伍房间...</div>

  return <div className="team-room-page">
    {!realtimeConnected && <div className="modal-backdrop realtime-overlay"><section className="modal" role="alertdialog" aria-modal="true"><h2>实时连接已断开</h2><p>队伍和聊天状态可能无法实时同步。</p><button className="button-primary" type="button" onClick={() => window.location.reload()}>重试连接</button></section></div>}
    <header className="room-topbar">
      <div className="brand-lockup"><span>Movers Squad</span><small>队伍房间</small></div>
      <div className="room-topbar-actions"><button className="button-secondary" type="button" onClick={() => navigate('/?room=1')}><ArrowLeft size={16} />返回大厅</button><span className="room-status"><i />{team.isAssembled ? '已成队' : '等待队友'}</span><button className="button-secondary" type="button" onClick={() => void onLogout()}><LogOut size={16} />退出登录</button></div>
    </header>

    <main className="room-shell">
      <aside className="room-sidebar">
        <header><div><span className="eyebrow">SQUAD ROOM</span><h1>{team.gameName}</h1></div><strong>{team.memberCount}<small> / {team.maxMembers}</small></strong></header>
        <p className="room-note">{team.note ?? '队长暂未添加备注'}</p>
        <section className="room-roster"><h2><UsersRound size={17} />队伍成员</h2>{team.members.map((member) => <article key={member.id}><Avatar user={member} size="md" /><span><strong>{member.florrId}</strong><small>{member.id === team.owner.id && <Crown size={12} />}等级 {member.level ?? 1}{member.id === team.owner.id ? ' · 队长' : ''}</small></span></article>)}</section>
        <button className={team.owner.id === user.id ? 'button-danger' : 'button-secondary room-exit'} type="button" onClick={() => void endMembership()}>{team.owner.id === user.id ? <><XCircle size={17} />关闭队伍</> : <><LogOut size={17} />退出队伍</>}</button>
      </aside>

      <section className="room-conversation">
        <header className="conversation-header"><div><h2>队伍聊天</h2><p>仅当前队伍成员可见</p></div>{hasMore && <button className="button-secondary load-older" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? '载入中...' : '更早消息'}</button>}</header>
        <div className="message-list" ref={messageListRef} aria-live="polite">
          {messages.length === 0 ? <div className="chat-empty"><Send size={21} /><strong>开始队伍交流</strong><span>发送第一条消息。</span></div> : messages.map((message) => {
            const own = message.sender.id === user.id
            return <article className={`chat-message ${own ? 'is-own' : ''}`} key={message.id}><Avatar user={message.sender} size="sm" /><div><span><strong>{message.sender.florrId}</strong><time>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></span><p>{message.body}</p></div></article>
          })}
        </div>
        <form className="message-composer" onSubmit={(event) => void sendMessage(event)}><textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={2000} rows={2} placeholder="输入消息" aria-label="消息内容" /><button className="button-primary" type="submit" disabled={sending || messageBody.trim() === ''} title="发送消息"><Send size={18} /></button></form>
      </section>

      <section className="voice-panel" aria-label="语音通话">
        <header><div><h2>语音通话</h2><p>{voiceState === 'connected' ? '通话已连接' : voiceState === 'connecting' ? '正在连接...' : voiceState === 'reconnecting' ? '正在重连...' : voiceState === 'error' ? '连接失败' : '尚未加入'}</p></div><span className={`voice-dot voice-${voiceState}`} /></header>
        <div className="voice-participants">{voiceParticipants.length === 0 ? <div className="voice-empty"><Headphones size={22} /><span>加入后可与队友实时通话</span></div> : voiceParticipants.map((participant) => {
          const member = memberByIdentity.get(participant.identity)
          return <div className={activeSpeakers.has(participant.identity) ? 'is-speaking' : ''} key={participant.identity}>{member ? <Avatar user={member} size="sm" /> : <span className="voice-avatar" /> }<span>{participant.name || member?.florrId || participant.identity}</span></div>
        })}</div>
        <div className="voice-controls">{voiceState === 'connected' || voiceState === 'reconnecting' ? <><button className="icon-button" type="button" onClick={() => void toggleMic()} title={micMuted ? '解除静音' : '麦克风静音'}>{micMuted ? <MicOff size={18} /> : <Mic size={18} />}</button><button className="icon-button" type="button" onClick={toggleRemoteAudio} title={remoteMuted ? '恢复队友声音' : '静音队友声音'}>{remoteMuted ? <HeadphoneOff size={18} /> : <Headphones size={18} />}</button><button className="voice-leave" type="button" onClick={leaveVoice} title="退出语音"><PhoneOff size={18} /></button></> : <button className="button-primary voice-join" type="button" disabled={voiceState === 'connecting' || !team.isAssembled} onClick={() => void joinVoice()}><Phone size={18} />{!team.isAssembled ? '成队后可加入语音' : voiceState === 'connecting' ? '连接中...' : '加入语音'}</button>}</div>
      </section>
    </main>
    <div ref={audioContainerRef} className="remote-audio" aria-hidden="true" />
    <ErrorDialog message={error} onClose={() => setError('')} />
  </div>
}
