import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getCsrfCookie } from '../lib/api'
import { AuthPage } from './AuthPage'

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
  getCsrfCookie: vi.fn(),
  getErrorMessage: vi.fn(() => '请求失败'),
}))

describe('AuthPage registration', () => {
  beforeEach(() => {
    vi.mocked(getCsrfCookie).mockResolvedValue({} as never)
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { id: 1, florrId: 'florr-7788', level: 1, avatarUrl: null } },
    })
  })

  it('requires and submits the Florr ID', async () => {
    const onAuthenticated = vi.fn()
    render(<MemoryRouter><AuthPage mode="register" onAuthenticated={onAuthenticated} /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Florr ID'), { target: { value: 'florr-7788' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: '创建账户' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/register', expect.objectContaining({
      florrId: 'florr-7788',
    })))
    expect(onAuthenticated).toHaveBeenCalled()
  })
})
