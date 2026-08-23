import { ArrowRight, Crown, ShieldCheck, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Team, User } from '../types'
import { Avatar } from './Avatar'

interface TeamDetailsDrawerProps { team: Team | null; currentUser: User; onClose: () => void; onEnterRoom: (team: Team) => void }

export function TeamDetailsDrawer({ team, currentUser, onClose, onEnterRoom }: TeamDetailsDrawerProps) {
  const [closing, setClosing] = useState(false)
  const [renderedTeam, setRenderedTeam] = useState(team)
  useEffect(() => { if (team) { setRenderedTeam(team); setClosing(false) } }, [team])
  const handleClose = () => { if (closing) return; setClosing(true); window.setTimeout(() => { setRenderedTeam(null); onClose() }, 220) }
  useEffect(() => {
    if (!renderedTeam) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') handleClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [renderedTeam, closing])

  const activeTeam = renderedTeam
  if (!activeTeam) return null
  const isMember = activeTeam.members.some((member) => member.id === currentUser.id)
  return <div className={`team-drawer-backdrop ${closing ? 'is-closing' : ''}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && handleClose()}>
    <aside className="team-drawer" role="dialog" aria-modal="true" aria-labelledby="team-detail-title">
      <header className="team-drawer-header">
        <div><span className="status">{activeTeam.isAssembled ? '已成队' : '招募中'}</span><h2 id="team-detail-title">{activeTeam.gameName}</h2><p>{activeTeam.note ?? '队长暂未添加备注'}</p></div>
        <button className="icon-button" type="button" onClick={handleClose} title="关闭详情"><X size={20} /></button>
      </header>
      <section className="team-detail-rules" aria-label="加入条件">
        <div><ShieldCheck size={17} /><span>最低等级</span><strong>{activeTeam.minLevel}</strong></div>
        <div><Users size={17} /><span>当前人数</span><strong>{activeTeam.memberCount} / {activeTeam.maxMembers}</strong></div>
      </section>
      {(activeTeam.excludedFlorrIds ?? []).length > 0 && <section className="excluded-list"><h3>排除的 Florr ID</h3><p>{activeTeam.excludedFlorrIds.join('、')}</p></section>}
      <section className="team-detail-members">
        <h3>队伍成员</h3>
        <div>{activeTeam.members.map((member) => {
          const isOwner = member.id === activeTeam.owner.id
          return <article key={member.id} className="detail-member-row"><Avatar user={member} size="md" /><span><strong>{member.florrId}</strong><small>{isOwner && <Crown size={12} />}等级 {member.level ?? 1}{isOwner ? ' · 队长' : ''}</small></span></article>
        })}</div>
      </section>
      {isMember && <button className="button-primary team-enter-room" type="button" onClick={() => onEnterRoom(activeTeam)}><ArrowRight size={17} />进入房间聊天</button>}
    </aside>
  </div>
}
