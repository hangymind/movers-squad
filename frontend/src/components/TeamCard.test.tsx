import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Team, User } from '../types'
import { TeamCard } from './TeamCard'

const owner: User = { id: 1, florrId: 'Captain_01', level: 88, avatarUrl: null }
const team: Team = {
  id: 9, gameName: 'Florr.io', note: '夜间狩猎', minLevel: 30, excludedFlorrIds: [], owner,
  members: [owner], memberCount: 1, maxMembers: 4, isFull: false, isAssembled: false,
  assembledAt: null, closedAt: null, createdAt: '2026-08-22T12:00:00Z',
}

describe('TeamCard', () => {
  it('opens details by mouse and keyboard without hijacking action buttons', () => {
    const onOpen = vi.fn()
    const onAction = vi.fn()
    render(<TeamCard team={team} currentUser={{ ...owner, id: 2 }} busy={false} onOpen={onOpen} onAction={onAction} />)
    const card = screen.getByLabelText('查看 Florr.io 组队详情')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: '加入队伍' }))
    expect(onAction).toHaveBeenCalledWith(team, 'join')
    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
