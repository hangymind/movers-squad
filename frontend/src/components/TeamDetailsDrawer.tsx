import { Crown, ShieldCheck, Users, X } from 'lucide-react'
import { useEffect } from 'react'
import type { Team } from '../types'
import { Avatar } from './Avatar'

interface TeamDetailsDrawerProps { team: Team | null; onClose: () => void }

export function TeamDetailsDrawer({ team, onClose }: TeamDetailsDrawerProps) {
  useEffect(() => {
    if (!team) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, team])

  if (!team) return null
  return <div className="team-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="team-drawer" role="dialog" aria-modal="true" aria-labelledby="team-detail-title">
      <header className="team-drawer-header">
        <div><span className="status">招募中</span><h2 id="team-detail-title">{team.gameName}</h2><p>{team.note ?? '队长暂未添加备注'}</p></div>
        <button className="icon-button" type="button" onClick={onClose} title="关闭详情"><X size={20} /></button>
      </header>
      <section className="team-detail-rules" aria-label="加入条件">
        <div><ShieldCheck size={17} /><span>最低等级</span><strong>{team.minLevel}</strong></div>
        <div><Users size={17} /><span>当前人数</span><strong>{team.memberCount} / {team.maxMembers}</strong></div>
      </section>
      {(team.excludedFlorrIds ?? []).length > 0 && <section className="excluded-list"><h3>排除的 Florr ID</h3><p>{team.excludedFlorrIds.join('、')}</p></section>}
      <section className="team-detail-members">
        <h3>队伍成员</h3>
        <div>{team.members.map((member) => {
          const isOwner = member.id === team.owner.id
          return <article key={member.id} className="detail-member-row"><Avatar user={member} size="md" /><span><strong>{member.florrId}</strong><small>{isOwner && <Crown size={12} />}等级 {member.level ?? 1}{isOwner ? ' · 队长' : ''}</small></span></article>
        })}</div>
      </section>
    </aside>
  </div>
}
