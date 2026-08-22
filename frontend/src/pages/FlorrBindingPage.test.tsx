import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { FlorrBindingPage } from './FlorrBindingPage'

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
  getErrorMessage: vi.fn(() => '请求失败'),
}))

describe('FlorrBindingPage', () => {
  beforeEach(() => vi.mocked(api.post).mockReset())

  it('validates and submits a supported screenshot', async () => {
    const user = { id: 1, florrId: 'florr-7788', avatarUrl: null, isFlorrVerified: false, florrBinding: { id: null, status: 'unbound' as const, submittedAt: null, reviewedAt: null, rejectionReason: null, resultUnread: false } }
    const onUserUpdated = vi.fn()
    vi.mocked(api.post).mockResolvedValue({ data: { user: { ...user, florrBinding: { ...user.florrBinding, id: 9, status: 'pending' as const } } } })
    render(<MemoryRouter><FlorrBindingPage user={user} onUserUpdated={onUserUpdated} /></MemoryRouter>)

    const file = new File(['image'], 'proof.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: '提交绑定申请' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/florr-bindings', expect.any(FormData)))
    expect(onUserUpdated).toHaveBeenCalled()
    expect(await screen.findByText('申请已提交')).toBeInTheDocument()
  })

  it('rejects unsupported file types before upload', () => {
    render(<MemoryRouter><FlorrBindingPage user={{ id: 1, florrId: 'florr', avatarUrl: null, isFlorrVerified: false }} onUserUpdated={vi.fn()} /></MemoryRouter>)
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'proof.gif', { type: 'image/gif' })] } })
    expect(screen.getByText('请上传 JPEG、PNG 或 WebP 格式的图片。')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
