import { describe, expect, it } from 'vitest'
import type { Team } from '../types'
import { parseTeamListResponse } from './teamListResponse'

const team: Team = {
  id: 9,
  gameName: 'Florr.io',
  note: null,
  minLevel: 1,
  excludedFlorrIds: [],
  owner: { id: 1, florrId: 'captain', avatarUrl: null },
  members: [{ id: 1, florrId: 'captain', avatarUrl: null }],
  memberCount: 1,
  maxMembers: 4,
  isFull: false,
  isAssembled: false,
  assembledAt: null,
  closedAt: null,
  createdAt: '2026-08-23T00:00:00Z',
}

describe('parseTeamListResponse', () => {
  it('reads the Laravel resource collection response', () => {
    expect(parseTeamListResponse({ data: [team] })).toEqual([team])
  })

  it('accepts an unwrapped collection for deployment compatibility', () => {
    expect(parseTeamListResponse([team])).toEqual([team])
  })

  it.each([
    undefined,
    {},
    { data: undefined },
  ])('rejects a malformed response without returning undefined', (payload) => {
    expect(parseTeamListResponse(payload)).toBeNull()
  })

  it('removes malformed teams while keeping valid recruitment data', () => {
    expect(parseTeamListResponse({ data: [{ ...team, members: undefined }, team] })).toEqual([team])
  })
})
