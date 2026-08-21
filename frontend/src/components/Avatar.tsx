import { useState } from 'react'
import type { User } from '../types'

interface AvatarProps { user: User; size?: 'sm' | 'md' | 'lg' }

export function Avatar({ user, size = 'md' }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = user.florrId.trim().charAt(0).toUpperCase() || '?'

  return (
    <span className={`avatar avatar-${size}`} title={`Florr ID: ${user.florrId}`} aria-label={`Florr ID ${user.florrId}`}>
      {user.avatarUrl && !imageFailed
        ? <img src={user.avatarUrl} alt="" onError={() => setImageFailed(true)} />
        : <span aria-hidden="true">{initial}</span>}
    </span>
  )
}
