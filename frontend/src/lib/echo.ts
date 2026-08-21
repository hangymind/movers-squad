import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import axios from 'axios'
import { apiOrigin } from './api'

declare global {
  interface Window { Pusher: typeof Pusher }
}

window.Pusher = Pusher

function getCookie(name: string): string {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : ''
}

export function createEcho() {
  const scheme = import.meta.env.VITE_REVERB_SCHEME ?? 'http'
  const sameOrigin = !import.meta.env.VITE_REVERB_HOST
  const reverbHost = import.meta.env.VITE_REVERB_HOST || window.location.hostname

  return new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY ?? 'movers-local-key',
    wsHost: reverbHost,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? (sameOrigin ? window.location.port || 80 : 8080)),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    channelAuthorization: {
      customHandler: (
        params: { socketId: string; channelName: string },
        callback: (error: Error | null, data: { auth: string; channel_data?: string } | null) => void,
      ) => {
        axios.post<{ auth: string; channel_data?: string }>(
          `${apiOrigin}/broadcasting/auth`,
          new URLSearchParams({ socket_id: params.socketId, channel_name: params.channelName }),
          {
            withCredentials: true,
            withXSRFToken: true,
            headers: {
              'X-XSRF-TOKEN': getCookie('XSRF-TOKEN'),
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ).then(({ data }) => callback(null, data))
          .catch((error: unknown) => callback(error instanceof Error ? error : new Error('频道鉴权失败'), null))
      },
    },
  })
}
