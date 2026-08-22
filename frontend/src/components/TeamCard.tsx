import { Clock3, Crown, LogIn, LogOut, Users, XCircle } from 'lucide-react'
import { Avatar } from './Avatar'
import type { Team, User } from '../types'

interface TeamCardProps {
  team: Team
  currentUser: User
  busy: boolean
  onAction: (team: Team, action: 'join' | 'leave' | 'close') => void
}

const relativeTime = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

function formatCreatedAt(value: string) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeTime.format(hours, 'hour')
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function TeamCard({ team, currentUser, busy, onAction }: TeamCardProps) {
  const isOwner = team.owner.id === currentUser.id
  const isMember = team.members.some((member) => member.id === currentUser.id)

  return (
    <article className="team-card">
      <header className="team-card-primary">
        <div className="team-card-meta">{team.isFull ? <span className="status status-full">已满员</span> : <span className="status">招募中</span>}<span className="created-time"><Clock3 size={13} />{formatCreatedAt(team.createdAt)}</span></div>
        <h3>{team.gameName}</h3>
        <div className="team-rules"><span>最低等级 {team.minLevel ?? 1}</span>{(team.excludedFlorrIds ?? []).length > 0 && <span>排除 {(team.excludedFlorrIds ?? []).length} 个 ID</span>}</div>
      </header>

      <div className="team-card-copy">
        <p className={team.note ? '' : 'team-note-empty'}>{team.note ?? '队长暂未添加备注'}</p>
        <div className="captain-row"><Avatar user={team.owner} size="sm" /><span><strong>{team.owner.florrId}</strong><small><Crown size={12} />队长 · 等级 {team.owner.level ?? 1}</small></span></div>
      </div>

      <div className="member-section">
        <div className="member-heading"><span><Users size={16} />队伍成员</span><strong>{team.memberCount}<small> / {team.maxMembers}</small></strong></div>
        <div className="member-list">
          {team.members.map((member) => <span className="member-item" key={member.id}><Avatar user={member} size="sm" /><small>{member.florrId}</small></span>)}
          {Array.from({ length: team.maxMembers - team.memberCount }, (_, index) => <span className="member-item" key={index}><span className="empty-slot" aria-label="空位">+</span><small>空位</small></span>)}
        </div>
      </div>

      <div className="team-card-action">{isOwner ? (
          <button className="button-danger" type="button" disabled={busy} onClick={() => onAction(team, 'close')}><XCircle size={17} />{busy ? '处理中...' : '关闭招募'}</button>
        ) : isMember ? (
          <button className="button-secondary card-action" type="button" disabled={busy} onClick={() => onAction(team, 'leave')}><LogOut size={17} />{busy ? '处理中...' : '退出队伍'}</button>
        ) : (
          <button className="button-primary card-action" type="button" disabled={busy || team.isFull} onClick={() => onAction(team, 'join')}><LogIn size={17} />{team.isFull ? '队伍已满' : busy ? '加入中...' : '加入队伍'}</button>
        )}</div>
    </article>
  )
}
