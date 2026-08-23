import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Team, User } from '../types'
import { api } from '../lib/api'
import { showJoinNotification } from '../lib/notifications'
import { DashboardPage } from './DashboardPage'

const mocks = vi.hoisted(() => ({
  channel: { listen: vi.fn(), stopListening: vi.fn() },
  handlers: new Map<string, (event: unknown) => void>(),
}))

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getErrorMessage: vi.fn(() => '请求失败'),
}))

vi.mock('../lib/echo', () => ({
  createEcho: () => ({ private: () => mocks.channel, leave: vi.fn(), disconnect: vi.fn() }),
  observeEchoConnection: (_echo: unknown, listener: (connected: boolean) => void) => {
    listener(true)
    return () => undefined
  },
}))

vi.mock('../lib/notifications', () => ({
  requestNotificationPermission: vi.fn().mockResolvedValue('granted'),
  showJoinNotification: vi.fn(),
  showTeamAssembledNotification: vi.fn(),
}))

const owner: User = { id: 1, florrId: 'captain', level: 50, avatarUrl: null, isFlorrVerified: true }
const currentTeam: Team = {
  id: 9,
  gameName: 'Florr.io',
  note: null,
  minLevel: 1,
  excludedFlorrIds: [],
  owner,
  members: [owner],
  memberCount: 1,
  maxMembers: 4,
  isFull: false,
  isAssembled: false,
  assembledAt: null,
  closedAt: null,
  createdAt: '2026-08-23T00:00:00Z',
}

describe('DashboardPage recruitment replacement', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(showJoinNotification).mockReset()
    mocks.handlers.clear()
    mocks.channel.listen.mockReset().mockImplementation((event: string, handler: (payload: unknown) => void) => {
      mocks.handlers.set(event, handler)
      return mocks.channel
    })
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({
      data: url === '/teams/current' ? { data: null } : { data: [currentTeam] },
    }))
  })

  it('requires confirmation and atomically replaces the owners active recruitment', async () => {
    const replacement = { ...currentTeam, id: 10, note: '新招募' }
    vi.mocked(api.post).mockResolvedValue({ data: { data: replacement } })
    render(<MemoryRouter><DashboardPage user={owner} onUserUpdated={vi.fn()} onLogout={vi.fn()} /></MemoryRouter>)

    await screen.findByText('1 支队伍')
    fireEvent.click(screen.getByRole('button', { name: '发布招募' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('替换当前招募？')

    fireEvent.click(screen.getByRole('button', { name: '确认并继续' }))
    const formDialog = screen.getByRole('dialog', { name: '发布组队招募' })
    fireEvent.change(within(formDialog).getByLabelText(/备注/), { target: { value: '新招募' } })
    fireEvent.click(within(formDialog).getByRole('button', { name: '发布招募' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/teams', expect.objectContaining({
      note: '新招募',
      replaceCurrentTeam: true,
    })))
    expect(await screen.findByText('新招募')).toBeInTheDocument()
  })

  it('updates members and notifies immediately when the realtime event arrives', async () => {
    render(<MemoryRouter><DashboardPage user={owner} onUserUpdated={vi.fn()} onLogout={vi.fn()} /></MemoryRouter>)
    await screen.findByText('1 支队伍')
    const requestsBeforeEvent = vi.mocked(api.get).mock.calls.length

    act(() => mocks.handlers.get('.TeamMemberJoined')?.({
      team: { id: currentTeam.id, gameName: currentTeam.gameName },
      joinedUser: { id: 2, florrId: 'new-member', level: 20, avatarUrl: null, isFlorrVerified: true },
      joinedAt: '2026-08-23T01:00:00Z',
      isAssembled: false,
    }))

    expect(screen.getByText('new-member')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: '.member-heading strong' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledTimes(requestsBeforeEvent)
    expect(showJoinNotification).toHaveBeenCalled()
  })

  it('detects joined members and sends the same notification during fallback refresh', async () => {
    render(<MemoryRouter><DashboardPage user={owner} onUserUpdated={vi.fn()} onLogout={vi.fn()} /></MemoryRouter>)
    await screen.findByText('1 支队伍')
    const joinedUser: User = { id: 2, florrId: 'fallback-member', level: 20, avatarUrl: null, isFlorrVerified: true }
    vi.mocked(api.get).mockImplementation((url) => Promise.resolve({
      data: url === '/teams/current'
        ? { data: null }
        : { data: [{ ...currentTeam, members: [owner, joinedUser], memberCount: 2 }] },
    }))

    fireEvent.click(screen.getByTitle('刷新队伍'))

    expect(await screen.findByText('fallback-member')).toBeInTheDocument()
    expect(showJoinNotification).toHaveBeenCalledWith(expect.objectContaining({ joinedUser }), owner.id)
  })
})
