import type { NotificationSettings, TeamAssembledEvent, TeamCreatedEvent, TeamMemberJoinedEvent, TeamMemberLeftEvent } from '../types'

export const defaultNotificationSettings: NotificationSettings = { showJoinNotifications: true, showTeamCreatedNotifications: true, showMemberLeftNotifications: true, notificationSoundEnabled: true }

let permissionRequest: Promise<NotificationPermission> | null = null

export function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return Promise.resolve('unsupported')
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
  permissionRequest ??= Notification.requestPermission()
    .catch(() => Notification.permission)
    .finally(() => { permissionRequest = null })
  return permissionRequest
}

function showNotification(title: string, options: NotificationOptions, settings: NotificationSettings): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null

  try {
    const notification = new Notification(title, options)
    notification.onclick = () => { window.focus(); notification.close() }
    window.setTimeout(() => notification.close(), 3000)
    if (settings.notificationSoundEnabled) { const audio = new Audio('/assets/noti.mp3'); audio.play().catch(() => undefined) }
    return notification
  } catch {
    return null
  }
}

export function showJoinNotification(event: TeamMemberJoinedEvent, currentUserId: number, settings = defaultNotificationSettings): Notification | null {
  if (event.joinedUser.id === currentUserId || !settings.showJoinNotifications) return null
  return showNotification(`${event.joinedUser.florrId} 加入组队`, { body: `${event.joinedUser.florrId} 加入了 ${event.team.gameName} 队伍`, icon: event.joinedUser.avatarUrl ?? undefined, tag: `team-${event.team.id}-joined-${event.joinedUser.id}` }, settings)
}

export function showTeamCreatedNotification(event: TeamCreatedEvent, settings = defaultNotificationSettings) {
  if (!settings.showTeamCreatedNotifications) return null
  return showNotification('新的组队招募', { body: event.team ? `${event.team.owner.florrId} 发布了 ${event.team.gameName} 招募` : '大厅有新的组队招募', tag: `team-${event.teamId}-created` }, settings)
}

export function showMemberLeftNotification(event: TeamMemberLeftEvent, settings = defaultNotificationSettings) {
  if (!settings.showMemberLeftNotifications) return null
  return showNotification(`${event.user.florrId} 退出组队`, { body: `${event.user.florrId} 已退出当前队伍`, tag: `team-${event.teamId}-left-${event.user.id}` }, settings)
}

export function showTeamAssembledNotification(event: TeamAssembledEvent, settings = defaultNotificationSettings): Notification | null {
  return showNotification('队伍已满，准备出发', { body: `${event.team.gameName} 队伍已满员，点击进入队伍房间。`, tag: `team-${event.team.id}-assembled` }, settings)
}
