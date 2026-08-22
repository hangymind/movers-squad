export interface User {
  id: number
  florrId: string
  level?: number
  avatarUrl: string | null
  isAdmin?: boolean
  isBanned?: boolean
  banId?: string | null
  bannedAt?: string | null
  isFlorrVerified?: boolean
  florrBinding?: FlorrBindingSummary
  reverbKey?: string
}

export type FlorrBindingStatus = 'unbound' | 'pending' | 'approved' | 'rejected'

export interface FlorrBindingSummary {
  id: number | null
  status: FlorrBindingStatus
  submittedAt: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  resultUnread: boolean
}

export interface FlorrBindingApplication {
  id: number
  status: Exclude<FlorrBindingStatus, 'unbound'>
  user?: Pick<User, 'id' | 'florrId'>
  screenshotMime: string | null
  screenshotSize: number | null
  hasImage: boolean
  rejectionReason: string | null
  submittedAt: string
  reviewedAt: string | null
  resultUnread: boolean
}

export interface FlorrBindingReviewedEvent {
  applicationId: number
  status: 'approved' | 'rejected'
  rejectionReason: string | null
  reviewedAt: string
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
