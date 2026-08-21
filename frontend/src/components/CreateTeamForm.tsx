import { useState, type FormEvent } from 'react'
import { Gamepad2, Plus, X } from 'lucide-react'
import { api, getErrorMessage } from '../lib/api'
import type { Team } from '../types'
import { ErrorDialog } from './ErrorDialog'

interface CreateTeamFormProps {
  open: boolean
  onClose: () => void
  onCreated: (team: Team) => void
}

export function CreateTeamForm({ open, onClose, onCreated }: CreateTeamFormProps) {
  const [note, setNote] = useState('')
  const [minLevel, setMinLevel] = useState('1')
  const [excludedIds, setExcludedIds] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const excludedFlorrIds = excludedIds.split(/[\n,]+/).map((id) => id.trim()).filter(Boolean)
      const { data } = await api.post<{ data: Team }>('/teams', { note, minLevel: Number(minLevel), excludedFlorrIds })
      setNote('')
      setMinLevel('1')
      setExcludedIds('')
      onCreated(data.data)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-team-title">
        <div className="modal-header">
          <div><span className="section-icon"><Gamepad2 size={18} /></span><h2 id="create-team-title">发布组队招募</h2></div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>最低等级<input type="number" min={1} max={1000} value={minLevel} onChange={(event) => setMinLevel(event.target.value)} required /></label>
            <label>排除 Florr ID <span className="optional">选填</span><textarea value={excludedIds} onChange={(event) => setExcludedIds(event.target.value)} placeholder="每行或逗号分隔一个 ID" maxLength={3300} rows={3} /></label>
          </div>
          <label>备注 <span className="optional">选填</span><textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="说明时间、区域、玩法或其他要求" maxLength={500} rows={4} /><span className="field-count">{note.length}/500</span></label>
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="button-primary" disabled={submitting}><Plus size={18} />{submitting ? '发布中...' : '发布招募'}</button>
          </div>
        </form>
      </section>
      <ErrorDialog message={error} onClose={() => setError('')} />
    </div>
  )
}
