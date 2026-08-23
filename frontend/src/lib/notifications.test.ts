import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestNotificationPermission, showJoinNotification, showTeamAssembledNotification } from './notifications'
import type { TeamAssembledEvent, TeamMemberJoinedEvent } from '../types'

const event: TeamMemberJoinedEvent = {
  team: { id: 8, gameName: 'APEX 英雄' },
  joinedUser: { id: 2, florrId: 'blue-2048', avatarUrl: 'https://example.com/avatar.png' },
  joinedAt: '2026-08-21T10:00:00Z',
}

describe('showJoinNotification', () => {
  const close = vi.fn()
  const notification = vi.fn(function NotificationMock() { return { close, onclick: null } })

  beforeEach(() => {
    notification.mockClear()
    close.mockClear()
    Object.defineProperty(notification, 'permission', { value: 'granted', configurable: true })
    vi.stubGlobal('Notification', notification)
  })

  it('shows the joined user and game to existing members', () => {
    showJoinNotification(event, 1)
    expect(notification).toHaveBeenCalledWith('blue-2048 加入组队', expect.objectContaining({ body: 'blue-2048 加入了 APEX 英雄 队伍', icon: event.joinedUser.avatarUrl }))
  })

  it('does not notify the user who just joined', () => {
    expect(showJoinNotification(event, 2)).toBeNull()
    expect(notification).not.toHaveBeenCalled()
  })

  it('does not notify when permission is denied', () => {
    Object.defineProperty(notification, 'permission', { value: 'denied', configurable: true })
    expect(showJoinNotification(event, 1)).toBeNull()
    expect(notification).not.toHaveBeenCalled()
  })

  it('does not break realtime handling when the browser rejects notification construction', () => {
    const failingNotification = vi.fn(() => { throw new Error('platform notification failure') })
    Object.defineProperty(failingNotification, 'permission', { value: 'granted', configurable: true })
    vi.stubGlobal('Notification', failingNotification)

    expect(showJoinNotification(event, 1)).toBeNull()
  })

  it('coalesces simultaneous permission requests from the user action', async () => {
    Object.defineProperty(notification, 'permission', { value: 'default', configurable: true })
    const requestPermission = vi.fn().mockResolvedValue('granted')
    Object.defineProperty(notification, 'requestPermission', { value: requestPermission, configurable: true })
    await Promise.all([requestNotificationPermission(), requestNotificationPermission()])
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('shows a stable full-team notification', () => {
    const assembled: TeamAssembledEvent = { team: { id: 8, gameName: 'Florr.io' }, assembledAt: '2026-08-22T12:00:00Z' }
    showTeamAssembledNotification(assembled)
    expect(notification).toHaveBeenCalledWith('队伍已满，准备出发', expect.objectContaining({ tag: 'team-8-assembled' }))
  })
})
