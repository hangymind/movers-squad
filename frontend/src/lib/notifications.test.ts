import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showJoinNotification } from './notifications'
import type { TeamMemberJoinedEvent } from '../types'

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
})
