import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeEchoConnection } from './echo'

describe('observeEchoConnection', () => {
  afterEach(() => vi.useRealTimers())

  it('waits 15 seconds before reporting an unavailable connection', () => {
    vi.useFakeTimers()
    let state = 'connecting'
    let stateChange: ((event: { current: string }) => void) | undefined
    const connection = {
      get state() { return state },
      bind: vi.fn((_event: string, handler: (event: { current: string }) => void) => { stateChange = handler }),
      unbind: vi.fn(),
    }
    const listener = vi.fn()
    const cleanup = observeEchoConnection({ connector: { pusher: { connection } } } as never, listener)

    expect(listener).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(14_999)
    expect(listener).not.toHaveBeenCalledWith('unavailable')
    vi.advanceTimersByTime(1)
    expect(listener).toHaveBeenLastCalledWith('unavailable')

    state = 'connected'
    stateChange?.({ current: 'connected' })
    expect(listener).toHaveBeenLastCalledWith('connected')
    cleanup()
  })

  it('cancels the unavailable state when connection recovers within grace', () => {
    vi.useFakeTimers()
    let state = 'disconnected'
    let stateChange: ((event: { current: string }) => void) | undefined
    const connection = {
      get state() { return state },
      bind: vi.fn((_event: string, handler: (event: { current: string }) => void) => { stateChange = handler }),
      unbind: vi.fn(),
    }
    const listener = vi.fn()
    const cleanup = observeEchoConnection({ connector: { pusher: { connection } } } as never, listener)
    vi.advanceTimersByTime(5000)
    state = 'connected'
    stateChange?.({ current: 'connected' })
    vi.advanceTimersByTime(20_000)

    expect(listener).not.toHaveBeenCalledWith('unavailable')
    expect(listener).toHaveBeenLastCalledWith('connected')
    cleanup()
  })
})
