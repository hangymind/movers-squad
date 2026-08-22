import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, ImageUp, UploadCloud, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'
import { ErrorDialog } from '../components/ErrorDialog'
import type { User } from '../types'

interface Props { user: User; onUserUpdated: (user: User) => void }
const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxSize = 10 * 1024 * 1024

export function FlorrBindingPage({ user, onUserUpdated }: Props) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const chooseFile = (next: File | null) => {
    if (!next) return
    if (!acceptedTypes.includes(next.type)) { setError('请上传 JPEG、PNG 或 WebP 格式的图片。'); return }
    if (next.size > maxSize) { setError('图片大小不能超过 10MB。'); return }
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(URL.createObjectURL(next))
    setError('')
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0] ?? null)
  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0] ?? null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file) { setError('请先选择一张游戏截图。'); return }
    setSubmitting(true)
    try {
      const body = new FormData(); body.append('screenshot', file)
      const { data } = await api.post<{ user: User }>('/florr-bindings', body)
      onUserUpdated(data.user)
      setSuccess(true)
    } catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setSubmitting(false) }
  }

  if (user.isFlorrVerified) return <div className="binding-page"><main className="binding-shell binding-finished"><CheckCircle2 size={44} /><h1>Florr 账户已绑定</h1><p>你的全部组队功能已经解锁。</p><Link className="button-primary" to="/">返回组队大厅</Link></main></div>
  if (user.florrBinding?.status === 'pending' && !success) return <div className="binding-page"><main className="binding-shell binding-finished"><ImageUp size={44} /><h1>申请正在审批</h1><p>审核最长可能需要 2 天，请耐心等待。</p><Link className="button-primary" to="/">返回组队大厅</Link></main></div>

  return <div className="binding-page">
    <header className="binding-header"><Link to="/" className="icon-button" title="返回大厅"><ArrowLeft size={19} /></Link><span>Florr 账户绑定</span></header>
    <main className="binding-shell">
      <div className="binding-heading"><span className="section-icon"><ImageUp size={20} /></span><div><h1>验证游戏账户</h1><p>提交能清楚显示游戏用户名、等级和背包内容的游戏截图。</p></div></div>
      <dl className="binding-account"><div><dt>当前 Florr ID</dt><dd>{user.florrId}</dd></div><div><dt>审核时间</dt><dd>最长可能需要 2 天</dd></div></dl>
      {user.florrBinding?.status === 'rejected' && <div className="binding-rejected"><strong>上次申请未通过</strong><p>{user.florrBinding.rejectionReason}</p></div>}
      <form onSubmit={submit}>
        <div className={`upload-dropzone ${dragging ? 'is-dragging' : ''} ${preview ? 'has-preview' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          {preview ? <><img src={preview} alt="待提交截图预览" /><button type="button" className="upload-remove" onClick={() => { setFile(null); setPreview('') }} title="移除图片"><X size={18} /></button></> : <button type="button" className="upload-prompt" onClick={() => inputRef.current?.click()}><UploadCloud size={34} /><strong>选择或拖放游戏截图</strong><span>JPEG、PNG、WebP，最大 10MB</span></button>}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onInput} hidden />
        </div>
        {preview && <button type="button" className="button-secondary upload-change" onClick={() => inputRef.current?.click()}>更换图片</button>}
        <button className="button-primary binding-submit" type="submit" disabled={!file || submitting}>{submitting ? '正在提交...' : '提交绑定申请'}</button>
      </form>
    </main>
    {success && <div className="modal-backdrop"><section className="modal binding-success" role="alertdialog" aria-modal="true"><CheckCircle2 size={42} /><h2>申请已提交</h2><p>审核最长可能需要 2 天。结果会在审批完成后通知你。</p><button className="button-primary" type="button" onClick={() => navigate('/')}>返回组队大厅</button></section></div>}
    <ErrorDialog message={error} onClose={() => setError('')} />
  </div>
}
