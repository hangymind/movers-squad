import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BuildLabel } from './BuildLabel'

describe('BuildLabel', () => {
  it('renders the compile-time date and short hash format', () => {
    render(<BuildLabel />)
    expect(screen.getByText(/^Build:Ver\d{8}-[0-9a-f]{7}$/)).toBeInTheDocument()
  })
})
