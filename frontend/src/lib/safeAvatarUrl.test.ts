import { describe, expect, it } from 'vitest'
import { isSafeAvatarUrl } from './safeAvatarUrl'

describe('isSafeAvatarUrl', () => {
  it('accepts safe HTTPS image links with paths and query parameters', () => {
    expect(isSafeAvatarUrl('https://cdn.example.com/avatars/player.png?size=96&signature=abc123')).toBe(true)
  })

  it.each([
    'http://cdn.example.com/avatar.png',
    'https://user:password@cdn.example.com/avatar.png',
    'https://cdn.example.com:8443/avatar.png',
    'https://cdn.example.com/avatar.png#fragment',
    'https://localhost/avatar.png',
    'https://avatars.local/avatar.png',
    'https://127.0.0.1/avatar.png',
    'https://[::1]/avatar.png',
    'javascript:alert(1)',
  ])('rejects unsafe avatar URL %s', (url) => {
    expect(isSafeAvatarUrl(url)).toBe(false)
  })
})
