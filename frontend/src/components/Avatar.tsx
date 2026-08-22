import { useState } from 'react'
import { isSafeAvatarUrl } from '../lib/safeAvatarUrl'
import type { User } from '../types'

interface AvatarProps { user: User; size?: 'sm' | 'md' | 'lg' }

export function Avatar({ user, size = 'md' }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initial = user.florrId.trim().charAt(0).toUpperCase() || '?'
  const avatarUrl = isSafeAvatarUrl(user.avatarUrl) ? user.avatarUrl : null

  return (
    <span className={`avatar-frame avatar-frame-${size}`} title={`Florr ID: ${user.florrId}`} aria-label={`Florr ID ${user.florrId}${user.isFlorrVerified ? '，已绑定' : ''}`}>
      <span className={`avatar avatar-${size}`}>
        {avatarUrl && failedUrl !== avatarUrl
          ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(avatarUrl)} />
          : <span aria-hidden="true">{initial}</span>}
      </span>
      {user.isFlorrVerified && <span className="florr-verified-mark" title="已绑定 Florr" aria-hidden="true" />}
    </span>
  )
}
