import { useState } from 'react'
import type { User } from '../types'

interface AvatarProps { user: User; size?: 'sm' | 'md' | 'lg' }

export function Avatar({ user, size = 'md' }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = user.florrId.trim().charAt(0).toUpperCase() || '?'

  return (
    <span className={`avatar-frame avatar-frame-${size}`} title={`Florr ID: ${user.florrId}`} aria-label={`Florr ID ${user.florrId}${user.isFlorrVerified ? '，已绑定' : ''}`}>
      <span className={`avatar avatar-${size}`}>
        {user.avatarUrl && !imageFailed
          ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
          : <span aria-hidden="true">{initial}</span>}
      </span>
      {user.isFlorrVerified && <span className="florr-verified-mark" title="已绑定 Florr" aria-hidden="true" />}
    </span>
  )
}
