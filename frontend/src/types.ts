export interface User {
  id: number
  florrId: string
  level?: number
  avatarUrl: string | null
  isAdmin?: boolean
  isBanned?: boolean
  banId?: string | null
  bannedAt?: string | null
}

export interface Team {
  id: number
  gameName: string
  note: string | null
  minLevel: number
  excludedFlorrIds: string[]
  owner: User
  members: User[]
  memberCount: number
  maxMembers: number
  isFull: boolean
  closedAt: string | null
  createdAt: string
}

export interface TeamMemberJoinedEvent {
  team: Pick<Team, 'id' | 'gameName'>
  joinedUser: User
  joinedAt: string
}

export interface ApiValidationError {
  message?: string
  errors?: Record<string, string[]>
}
