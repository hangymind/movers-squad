import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { PublicMessage, User } from '../types'
import { PublicRoomPage } from './PublicRoomPage'

const mocks = vi.hoisted(() => ({
  channel: { listen: vi.fn() },
  handlers: new Map<string, (event: unknown) => void>(),
  roomHandlers: new Map<string, (...args: unknown[]) => void>(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  setMicrophoneEnabled: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getErrorMessage: vi.fn(() => '请求失败'),
}))

vi.mock('../lib/echo', () => ({
  createEcho: () => ({ private: () => mocks.channel, leave: vi.fn(), disconnect: vi.fn() }),
  keepEchoConnection: () => () => undefined,
  observeEchoConnection: (_echo: unknown, listener: (status: string) => void) => {
    listener('connected')
    return () => undefined
  },
}))

vi.mock('livekit-client', () => ({
  RoomEvent: {
    TrackSubscribed: 'TrackSubscribed',
    TrackUnsubscribed: 'TrackUnsubscribed',
    ParticipantConnected: 'ParticipantConnected',
    ParticipantDisconnected: 'ParticipantDisconnected',
    ActiveSpeakersChanged: 'ActiveSpeakersChanged',
    Reconnecting: 'Reconnecting',
    Reconnected: 'Reconnected',
    Disconnected: 'Disconnected',
  },
  Track: { Kind: { Audio: 'audio' } },
  Room: class {
    localParticipant = { identity: 'user:1', setMicrophoneEnabled: mocks.setMicrophoneEnabled }
    remoteParticipants = new Map()
    on(event: string, handler: (...args: unknown[]) => void) { mocks.roomHandlers.set(event, handler); return this }
    connect = mocks.connect
    disconnect = mocks.disconnect
  },
}))

const user: User = { id: 1, florrId: 'public-user', avatarUrl: null, isFlorrVerified: false }
const other: User = { id: 2, florrId: 'voice-user', avatarUrl: null, isFlorrVerified: true }
const initialMessage: PublicMessage = {
  id: 1,
  sender: other,
  body: '公共消息',
  createdAt: '2026-08-23T01:00:00Z',
}

describe('PublicRoomPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    mocks.handlers.clear()
    mocks.roomHandlers.clear()
    mocks.channel.listen.mockReset().mockImplementation((event: string, handler: (payload: unknown) => void) => {
      mocks.handlers.set(event, handler)
      return mocks.channel
    })
    mocks.connect.mockClear()
    mocks.disconnect.mockClear()
    mocks.setMicrophoneEnabled.mockReset().mockResolvedValue(undefined)
    vi.mocked(api.get).mockReset().mockImplementation((url) => Promise.resolve({
      data: url === '/public-room/messages'
        ? { data: [initialMessage], meta: { hasMore: false, nextBefore: null } }
        : { data: [other], meta: { count: 1, available: true } },
    }))
    vi.mocked(api.post).mockReset()
  })

  it('loads public chat and voice roster and appends realtime messages once', async () => {
    render(<MemoryRouter><PublicRoomPage user={user} onLogout={vi.fn()} /></MemoryRouter>)

    expect(await screen.findByText('公共消息')).toBeInTheDocument()
    expect(screen.getAllByText('voice-user').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '公共' })).toHaveClass('active')

    act(() => mocks.handlers.get('.PublicMessageCreated')?.({
      message: { ...initialMessage, id: 2, body: '实时到达' },
    }))
    act(() => mocks.handlers.get('.PublicMessageCreated')?.({
      message: { ...initialMessage, id: 2, body: '实时到达' },
    }))

    expect(screen.getAllByText('实时到达')).toHaveLength(1)
  })

  it('enters voice muted and retries microphone permission when unmuting', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { serverUrl: 'wss://voice.example.com', token: 'token', roomName: 'movers-public' } },
    })
    mocks.setMicrophoneEnabled.mockImplementation((enabled: boolean) => enabled ? Promise.reject(new Error('denied')) : Promise.resolve())
    render(<MemoryRouter><PublicRoomPage user={user} onLogout={vi.fn()} /></MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: '加入语音' }))
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith('wss://voice.example.com', 'token'))
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(false)

    fireEvent.click(await screen.findByTitle('解除静音'))
    await waitFor(() => expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true))
    expect(await screen.findByText('请求失败')).toBeInTheDocument()
    expect(screen.getByTitle('解除静音')).toBeInTheDocument()
  })
})
