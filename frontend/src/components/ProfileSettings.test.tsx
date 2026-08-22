import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileSettings } from './ProfileSettings'

const mocks = vi.hoisted(() => ({ patch: vi.fn() }))

vi.mock('../lib/api', () => ({
  api: { patch: mocks.patch },
  getErrorMessage: () => 'request failed',
}))

describe('ProfileSettings', () => {
  beforeEach(() => mocks.patch.mockReset())

  it('blocks unsafe avatar URLs before sending a request', () => {
    render(<ProfileSettings user={{ id: 1, florrId: 'player', level: 12, avatarUrl: null }} open onClose={vi.fn()} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/头像链接/), { target: { value: 'http://127.0.0.1/avatar.png' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    expect(screen.getByText(/头像链接必须使用 HTTPS/)).toBeInTheDocument()
    expect(mocks.patch).not.toHaveBeenCalled()
  })
})
