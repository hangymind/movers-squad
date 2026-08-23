import type { Team } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isUser(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'number'
    && typeof value.florrId === 'string'
    && isNullableString(value.avatarUrl)
}

function isTeam(value: unknown): value is Team {
  if (!isRecord(value)) return false

  return typeof value.id === 'number'
    && typeof value.gameName === 'string'
    && isNullableString(value.note)
    && typeof value.minLevel === 'number'
    && Array.isArray(value.excludedFlorrIds)
    && value.excludedFlorrIds.every((id) => typeof id === 'string')
    && isUser(value.owner)
    && Array.isArray(value.members) && value.members.every(isUser)
    && typeof value.memberCount === 'number'
    && typeof value.maxMembers === 'number'
    && typeof value.isFull === 'boolean'
    && typeof value.isAssembled === 'boolean'
    && isNullableString(value.assembledAt)
    && isNullableString(value.closedAt)
    && typeof value.createdAt === 'string'
}

export function parseTeamListResponse(payload: unknown): Team[] | null {
  const list = isRecord(payload) && 'data' in payload ? payload.data : payload
  return Array.isArray(list) ? list.filter(isTeam) : null
}
