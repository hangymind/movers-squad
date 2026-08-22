import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppLoading } from './AppLoading'

describe('AppLoading', () => {
  it('announces the lobby connection state without claiming a WebSocket handshake', () => {
    render(<AppLoading />)
    expect(screen.getByRole('status')).toHaveTextContent('正在进入组队大厅')
    expect(screen.queryByText(/WebSocket/i)).not.toBeInTheDocument()
  })
})
