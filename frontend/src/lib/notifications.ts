import type { TeamAssembledEvent, TeamMemberJoinedEvent } from '../types'

let permissionRequest: Promise<NotificationPermission> | null = null

export function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return Promise.resolve('unsupported')
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
  permissionRequest ??= Notification.requestPermission()
    .catch(() => Notification.permission)
    .finally(() => { permissionRequest = null })
  return permissionRequest
}

export function showJoinNotification(event: TeamMemberJoinedEvent, currentUserId: number): Notification | null {
  if (event.joinedUser.id === currentUserId || !('Notification' in window) || Notification.permission !== 'granted') return null

  try {
    const notification = new Notification(`${event.joinedUser.florrId} 加入组队`, {
      body: `${event.joinedUser.florrId} 加入了 ${event.team.gameName} 队伍`,
      icon: event.joinedUser.avatarUrl ?? undefined,
      tag: `team-${event.team.id}-joined-${event.joinedUser.id}`,
    })
    notification.onclick = () => { window.focus(); notification.close() }

    return notification
  } catch {
    return null
  }
}

export function showTeamAssembledNotification(event: TeamAssembledEvent): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null

  try {
    const notification = new Notification('队伍已满，准备出发', {
      body: `${event.team.gameName} 队伍已满员，点击进入队伍房间。`,
      tag: `team-${event.team.id}-assembled`,
    })
    notification.onclick = () => {
      window.focus()
      window.location.assign(`/teams/${event.team.id}/room`)
      notification.close()
    }
    return notification
  } catch {
    return null
  }
}
