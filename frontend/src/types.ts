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
  notificationSettings?: NotificationSettings
  geoHuntProfile?: GeoHuntProfile
}

export interface GeoHuntProfile {
  level: number
  experience: number
  experienceIntoLevel: number
  experienceForNextLevel: number
  wins: number
  losses: number
  matchesPlayed: number
}

export interface GeoHuntLobby {
  profile: GeoHuntProfile
  queued: boolean
  queueCount: number
  currentMatchId: number | null
  currentRoomCode: string | null
  publicRooms: GeoHuntRoomSummary[]
}

export type GeoHuntMode = 'ranked_1v1' | 'private' | 'admin_public'

export interface GeoHuntRoomSummary {
  id: number
  code: string
  name: string | null
  mode: Exclude<GeoHuntMode, 'ranked_1v1'>
  host: Pick<User, 'id' | 'florrId'> | null
  playerCount: number
  maxPlayers: number
  status: 'waiting' | 'playing' | 'reveal' | 'finished'
  createdAt: string
}

export interface GeoHuntRoomState extends GeoHuntRoomSummary {
  stateVersion: number
  hostId: number
  players: Array<{ user: User; seat: number }>
}

export interface GeoHuntTile {
  imageUrl: string
  width: number
  height: number
}

export interface GeoHuntTileLayer { name: string; data: number[] }
export interface GeoHuntEncodedTileLayer { name: string; encoding: 'base64-gzip-u32le'; data: string }

export interface GeoHuntMap {
  key: string
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  backgroundColor: string
  layers: GeoHuntTileLayer[]
  tiles: Record<string, GeoHuntTile>
}

export interface GeoHuntMapPayload extends Omit<GeoHuntMap, 'layers'> {
  layers: Array<GeoHuntTileLayer | GeoHuntEncodedTileLayer>
}

export interface GeoHuntSnippet {
  width: number
  height: number
  layers: GeoHuntTileLayer[]
}

export interface GeoHuntGuessResult {
  userId: number
  x: number | null
  y: number | null
  distanceTiles: number | null
  score: number
  timedOut: boolean
  damageTaken: number
  hpAfter: number | null
}

export interface GeoHuntRoundResult {
  target: { x: number; y: number }
  damage: number
  damagedUserId: number | null
  guesses: GeoHuntGuessResult[]
}

export interface GeoHuntRound {
  id: number
  number: number
  mapKey: string
  multiplier: number
  deadlineAt: string
  firstGuessAt: string | null
  revealUntil: string | null
  submitted: boolean
  submittedCount: number
  requiredGuesses: number
  snippet: GeoHuntSnippet
  result: GeoHuntRoundResult | null
}

export interface GeoHuntMatchPlayer {
  user: User
  hp: number
  connected: boolean
  xpAwarded: number
  seat: number
  eliminated: boolean
  placement: number | null
}

export interface GeoHuntMatchState {
  id: number
  status: 'playing' | 'reveal' | 'finished'
  mode: GeoHuntMode
  roomCode: string | null
  roomName: string | null
  maxPlayers: number
  hostId: number | null
  stateVersion: number
  self: GeoHuntMatchPlayer
  players: GeoHuntMatchPlayer[]
  opponent?: GeoHuntMatchPlayer | null
  round: GeoHuntRound | null
  winnerId: number | null
  endedReason: 'knockout' | 'forfeit' | 'disconnect' | 'admin_closed' | 'host_closed' | 'abandoned' | null
  finishedAt: string | null
  profile: GeoHuntProfile
}

export interface GeoHuntMatchFoundEvent { matchId: number }

export interface NotificationSettings {
  showJoinNotifications: boolean
  showTeamCreatedNotifications: boolean
  showMemberLeftNotifications: boolean
  notificationSoundEnabled: boolean
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
  isAssembled: boolean
  assembledAt: string | null
  closedAt: string | null
  createdAt: string
}

export type AdminTeam = Team

export interface TeamMemberJoinedEvent {
  team: Pick<Team, 'id' | 'gameName'>
  joinedUser: User
  joinedAt: string
  isAssembled?: boolean
}

export interface TeamCreatedEvent {
  teamId: number
  team?: Pick<Team, 'id' | 'gameName' | 'owner' | 'maxMembers' | 'memberCount'>
}

export interface TeamAssembledEvent {
  team: Pick<Team, 'id' | 'gameName'>
  assembledAt: string
}

export interface TeamMemberLeftEvent {
  teamId: number
  user: Pick<User, 'id' | 'florrId'>
  leftAt: string
}

export interface TeamClosedEvent {
  teamId: number
  closedAt: string
}

export interface TeamMessage {
  id: number
  teamId: number
  sender: User
  body: string
  createdAt: string
}

export interface TeamMessageCreatedEvent { message: TeamMessage }

export interface PublicMessage {
  id: number
  sender: User
  body: string
  createdAt: string
}

export interface PublicMessageCreatedEvent { message: PublicMessage }

export interface PublicMessagePage {
  data: PublicMessage[]
  meta: { hasMore: boolean; nextBefore: number | null }
}

export interface VoiceParticipantPage {
  data: User[]
  meta: { count: number; available: boolean }
}

export interface MessagePage {
  data: TeamMessage[]
  meta: { hasMore: boolean; nextBefore: number | null; unreadCount: number }
}

export interface VoiceCredentials {
  serverUrl: string
  token: string
  roomName: string
}

export interface ApiValidationError {
  message?: string
  errors?: Record<string, string[]>
}
