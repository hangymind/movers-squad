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

export function createEcho(key: string) {
  const secure = window.location.protocol === 'https:'
  const pagePort = window.location.port ? Number(window.location.port) : secure ? 443 : 80

  return new Echo({
    broadcaster: 'reverb',
    key,
    wsHost: window.location.hostname,
    wsPort: pagePort,
    wssPort: pagePort,
    forceTLS: secure,
    enabledTransports: ['ws', 'wss'],
    channelAuthorization: {
      customHandler: (
        params: { socketId: string; channelName: string },
        callback: (error: Error | null, data: { auth: string; channel_data?: string } | null) => void,
      ) => {
        const authorize = async () => {
          if (!getCookie('XSRF-TOKEN')) {
            await axios.get(`${apiOrigin}/sanctum/csrf-cookie`, { withCredentials: true })
          }

          return axios.post<{ auth: string; channel_data?: string }>(
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
          )
        }

        authorize().then(({ data }) => callback(null, data))
          .catch((error: unknown) => callback(error instanceof Error ? error : new Error('频道鉴权失败'), null))
      },
    },
  })
}
