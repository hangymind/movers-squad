let timer = null

function stop() {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

function schedule() {
  stop()
  timer = setTimeout(() => {
    self.postMessage({ type: 'sync' })
    schedule()
  }, 5000)
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'start') schedule()
  if (event.data?.type === 'stop') stop()
  if (event.data?.type === 'sync-now') self.postMessage({ type: 'sync' })
})
