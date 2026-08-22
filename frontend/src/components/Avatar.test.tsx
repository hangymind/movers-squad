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
})
