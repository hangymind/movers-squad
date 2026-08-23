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

export function observeEchoConnection(echo: ReturnType<typeof createEcho>, listener: (connected: boolean) => void) {
  const connection = echo.connector.pusher.connection
  const handleStateChange = ({ current }: { current: string }) => listener(current === 'connected')
  connection.bind('state_change', handleStateChange)
  listener(connection.state === 'connected')

  return () => { connection.unbind('state_change', handleStateChange) }
}

export function keepEchoConnection(echo: ReturnType<typeof createEcho>) {
  const connection = echo.connector.pusher.connection
  let connectingSince = connection.state === 'connecting' ? Date.now() : 0
  const reconnect = () => {
    if (connection.state === 'disconnected' || connection.state === 'unavailable') {
      connectingSince = Date.now()
      connection.connect()
      return
    }
    if (connection.state === 'connecting' && connectingSince > 0 && Date.now() - connectingSince >= 15_000) {
      connection.disconnect()
      connectingSince = Date.now()
      connection.connect()
    }
  }
  const handleStateChange = ({ current }: { current: string }) => { connectingSince = current === 'connecting' ? Date.now() : 0 }
  connection.bind('state_change', handleStateChange)
  document.addEventListener('visibilitychange', reconnect)
  window.addEventListener('focus', reconnect)
  const watchdog = window.setInterval(reconnect, 5000)
  reconnect()
  return () => {
    window.clearInterval(watchdog)
    connection.unbind('state_change', handleStateChange)
    document.removeEventListener('visibilitychange', reconnect)
    window.removeEventListener('focus', reconnect)
  }
}
