import type { TeamMemberJoinedEvent } from '../types'

export function showJoinNotification(event: TeamMemberJoinedEvent, currentUserId: number): Notification | null {
  if (event.joinedUser.id === currentUserId || !('Notification' in window) || Notification.permission !== 'granted') return null

  const notification = new Notification(`${event.joinedUser.florrId} 加入组队`, {
    body: `${event.joinedUser.florrId} 加入了 ${event.team.gameName} 队伍`,
    icon: event.joinedUser.avatarUrl ?? undefined,
    tag: `team-${event.team.id}-joined-${event.joinedUser.id}`,
  })
  notification.onclick = () => { window.focus(); notification.close() }

  return notification
}
