import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { NotificationSettings, User } from '../types'

interface Props { user: User; open: boolean; onClose: () => void; onSaved: (user: User) => void }
const defaults: NotificationSettings = { showJoinNotifications: true, showTeamCreatedNotifications: true, showMemberLeftNotifications: true, notificationSoundEnabled: true }

export function NotificationSettingsPanel({ user, open, onClose, onSaved }: Props) {
  const [settings, setSettings] = useState<NotificationSettings>({ ...defaults, ...user.notificationSettings })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) setSettings({ ...defaults, ...user.notificationSettings }) }, [open, user.notificationSettings])
  if (!open) return null
  const save = async () => {
    setSaving(true); setError('')
    try { const { data } = await api.patch<{ data: User }>('/user/notification-settings', settings); onSaved(data.data); onClose() }
    catch (e) { setError(getErrorMessage(e)) }
    finally { setSaving(false) }
  }
  const items: Array<[keyof NotificationSettings, string]> = [['showJoinNotifications', '显示入队通知'], ['showTeamCreatedNotifications', '显示开队通知'], ['showMemberLeftNotifications', '显示成员退出组队通知'], ['notificationSoundEnabled', '通知铃声']]
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="notification-settings-title"><div className="modal-header"><div><span className="section-icon"><Bell size={18} /></span><h2 id="notification-settings-title">通知设置</h2></div><button className="icon-button" type="button" onClick={onClose} title="关闭"><X size={20} /></button></div><div className="settings-list">{items.map(([key, label]) => <label key={key} className="setting-row"><span>{label}</span><input type="checkbox" checked={settings[key]} onChange={(e) => setSettings((current) => ({ ...current, [key]: e.target.checked }))} /></label>)}</div>{error && <p role="alert" className="form-error">{error}</p>}<div className="modal-actions"><button className="button-secondary" type="button" onClick={onClose}>取消</button><button className="button-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存设置'}</button></div></section></div>
}
