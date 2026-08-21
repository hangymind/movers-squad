import { useState, type FormEvent } from 'react'
import { Save, UserCog, X } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { User } from '../types'
import { ErrorDialog } from './ErrorDialog'

interface Props { user: User; open: boolean; onClose: () => void; onSaved: (user: User) => void }

export function ProfileSettings({ user, open, onClose, onSaved }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '')
  const [level, setLevel] = useState(String(user.level ?? 1))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  if (!open) return null
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSaving(true)
    try {
      const { data } = await api.patch<{ data: User }>('/user', { avatarUrl: avatarUrl || null, level: Number(level) })
      onSaved(data.data); onClose()
    } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setSaving(false) }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="modal-header"><div><span className="section-icon"><UserCog size={18} /></span><h2 id="profile-title">档案设置</h2></div><button className="icon-button" type="button" onClick={onClose} title="关闭"><X size={20} /></button></div>
      <form onSubmit={submit}>
        <label>绑定 Florr ID<input value={user.florrId} readOnly /></label>
        <label>Florr 等级<input type="number" min={1} max={1000} value={level} onChange={(event) => setLevel(event.target.value)} required /></label>
        <label>头像链接 <span className="optional">选填</span><input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} maxLength={2048} placeholder="https://example.com/avatar.jpg" /></label>
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>取消</button><button type="submit" className="button-primary" disabled={saving}><Save size={17} />{saving ? '保存中...' : '保存设置'}</button></div>
      </form>
    </section>
    <ErrorDialog message={error} onClose={() => setError('')} />
  </div>
}
