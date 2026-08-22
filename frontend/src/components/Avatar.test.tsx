import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('shows the Florr verification mark only for verified users', () => {
    const { container, rerender } = render(<Avatar user={{ id: 1, florrId: 'florr-1', avatarUrl: null, isFlorrVerified: true }} />)
    expect(container.querySelector('.florr-verified-mark')).toBeInTheDocument()
    expect(screen.getByLabelText(/已绑定/)).toBeInTheDocument()

    rerender(<Avatar user={{ id: 2, florrId: 'florr-2', avatarUrl: null, isFlorrVerified: false }} />)
    expect(container.querySelector('.florr-verified-mark')).not.toBeInTheDocument()
  })

  it('renders only safe HTTPS avatar URLs', () => {
    const { container, rerender } = render(<Avatar user={{ id: 1, florrId: 'florr-1', avatarUrl: 'http://127.0.0.1/avatar.png' }} />)
    expect(container.querySelector('img')).not.toBeInTheDocument()

    rerender(<Avatar user={{ id: 1, florrId: 'florr-1', avatarUrl: 'https://cdn.example.com/avatar.png' }} />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/avatar.png')
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
  })
})
