import type { User } from '../types'

export function BannedPage({ user }: { user: User }) {
  return <main className="banned-page">
    <section className="banned-card">
      <h1>您已被封禁！</h1>
      <p>请检查是不是您行为不当，恶意组队。</p>
      <strong>{user.banId ?? 'BAN-ID-PENDING'}</strong>
    </section>
  </main>
}
