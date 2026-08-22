import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Ban, Check, CheckCircle2, Images, KeyRound, Search, ShieldCheck, Trash2, UserCheck, Users, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, apiOrigin, getErrorMessage } from '../lib/api'
import { ErrorDialog } from '../components/ErrorDialog'
import type { FlorrBindingApplication, User } from '../types'

type AdminTab = 'bindings' | 'users' | 'images'
interface Paginated<T> { data: T[]; meta: { total: number; current_page: number; last_page: number } }
const imageUrl = (id: number) => `${apiOrigin}/api/admin/florr-bindings/${id}/image`
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-'
const formatSize = (bytes: number | null) => bytes === null ? '-' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('bindings')
  const [users, setUsers] = useState<User[]>([])
  const [bindings, setBindings] = useState<FlorrBindingApplication[]>([])
  const [images, setImages] = useState<FlorrBindingApplication[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [bindingsPage, setBindingsPage] = useState(1)
  const [bindingsLastPage, setBindingsLastPage] = useState(1)
  const [imagesPage, setImagesPage] = useState(1)
  const [imagesLastPage, setImagesLastPage] = useState(1)
  const [selectedImages, setSelectedImages] = useState<number[]>([])
  const [lightbox, setLightbox] = useState<FlorrBindingApplication | null>(null)
  const [rejecting, setRejecting] = useState<FlorrBindingApplication | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [password, setPassword] = useState('')
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  const loadPending = useCallback(async (page = 1) => {
    try { const { data } = await api.get<Paginated<FlorrBindingApplication>>('/admin/florr-bindings', { params: { status: 'pending', page } }); setBindings(data.data); setPendingCount(data.meta.total); setBindingsPage(data.meta.current_page); setBindingsLastPage(data.meta.last_page) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }, [])
  const loadUsers = useCallback(async (query = '') => {
    try { const { data } = await api.get<{ data: User[] }>('/admin/users', { params: { search: query || undefined } }); setUsers(data.data) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }, [])
  const loadImages = useCallback(async (page = 1) => {
    try { const { data } = await api.get<Paginated<FlorrBindingApplication>>('/admin/florr-images', { params: { page } }); setImages(data.data); setImagesPage(data.meta.current_page); setImagesLastPage(data.meta.last_page); setSelectedImages([]) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }, [])

  // Loading the protected approval queue is the synchronization this effect owns.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadPending() }, [loadPending])

  const switchTab = (next: AdminTab) => {
    setTab(next)
    if (next === 'users' && users.length === 0) void loadUsers()
    if (next === 'images') void loadImages()
  }

  const review = async (application: FlorrBindingApplication, action: 'approve' | 'reject', reason?: string) => {
    setBusyId(application.id)
    try { await api.post(`/admin/florr-bindings/${application.id}/${action}`, reason ? { reason } : undefined); setBindings((current) => current.filter((item) => item.id !== application.id)); setPendingCount((count) => Math.max(0, count - 1)); setRejecting(null); setRejectReason('') }
    catch (requestError) { setError(getErrorMessage(requestError)) }
    finally { setBusyId(null) }
  }
  const submitReject = (event: FormEvent) => { event.preventDefault(); if (rejecting && rejectReason.trim()) void review(rejecting, 'reject', rejectReason.trim()) }
  const deleteImage = async (id: number) => {
    try { await api.delete(`/admin/florr-images/${id}`); setImages((current) => current.filter((item) => item.id !== id)); setSelectedImages((current) => current.filter((item) => item !== id)) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const deleteSelected = async () => {
    if (selectedImages.length === 0) return
    try { await api.delete('/admin/florr-images', { data: { ids: selectedImages } }); setImages((current) => current.filter((item) => !selectedImages.includes(item.id))); setSelectedImages([]) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const submitSearch = (event: FormEvent) => { event.preventDefault(); void loadUsers(search.trim()) }
  const updateUser = (updated: User) => setUsers((current) => current.map((user) => user.id === updated.id ? updated : user))
  const toggleBan = async (user: User) => {
    try { const { data } = await api.post<{ data: User }>(`/admin/users/${user.id}/${user.isBanned ? 'unban' : 'ban'}`); updateUser(data.data) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const savePassword = async (event: FormEvent) => {
    event.preventDefault(); if (!passwordUser) return
    try { await api.patch(`/admin/users/${passwordUser.id}/password`, { password }); setPassword(''); setPasswordUser(null) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const confirmDelete = async () => {
    if (!deleteUser) return
    try { await api.delete(`/admin/users/${deleteUser.id}`); setUsers((current) => current.filter((user) => user.id !== deleteUser.id)); setDeleteUser(null) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const allSelected = images.length > 0 && images.every((item) => selectedImages.includes(item.id))

  return <div className="admin-page">
    <header className="admin-header"><Link to="/" className="icon-button" title="返回大厅"><ArrowLeft size={19} /></Link><div><span className="eyebrow">MOVERS CONTROL</span><h1>管理后台</h1></div></header>
    <main className="admin-main">
      <nav className="admin-tabs" aria-label="管理视图"><button className={tab === 'bindings' ? 'active' : ''} onClick={() => switchTab('bindings')}><UserCheck size={17} />绑定审批{pendingCount > 0 && <span>{pendingCount}</span>}</button><button className={tab === 'users' ? 'active' : ''} onClick={() => switchTab('users')}><Users size={17} />用户管理</button><button className={tab === 'images' ? 'active' : ''} onClick={() => switchTab('images')}><Images size={17} />图片资源</button></nav>

      {tab === 'bindings' && <section className="admin-panel"><div className="admin-panel-heading"><div><h2>待审批申请</h2><p>核对截图中的用户名、等级和背包内容。</p></div></div>{bindings.length === 0 ? <div className="admin-empty"><CheckCircle2 size={30} /><strong>没有待处理申请</strong></div> : <><div className="binding-review-list">{bindings.map((item) => <article className="binding-review-item" key={item.id}><button className="review-image" type="button" onClick={() => setLightbox(item)} title="查看完整截图"><img src={imageUrl(item.id)} alt={`${item.user?.florrId} 提交的游戏截图`} /></button><div className="review-details"><span className="review-status">等待审批</span><h3>{item.user?.florrId}</h3><dl><div><dt>用户 ID</dt><dd>#{item.user?.id}</dd></div><div><dt>提交时间</dt><dd>{formatDate(item.submittedAt)}</dd></div><div><dt>文件大小</dt><dd>{formatSize(item.screenshotSize)}</dd></div></dl><div className="review-actions"><button className="button-secondary reject-button" disabled={busyId === item.id} onClick={() => setRejecting(item)}><XCircle size={16} />拒绝</button><button className="button-primary" disabled={busyId === item.id} onClick={() => void review(item, 'approve')}><Check size={16} />{busyId === item.id ? '处理中...' : '通过'}</button></div></div></article>)}</div><Pagination page={bindingsPage} lastPage={bindingsLastPage} onPage={(page) => void loadPending(page)} /></>}</section>}

      {tab === 'users' && <section className="admin-panel"><form className="admin-search" onSubmit={submitSearch}><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 Florr ID 或 Ban ID" /><button className="button-primary" type="submit">搜索</button></form><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Florr ID</th><th>等级</th><th>绑定</th><th>Ban ID</th><th>状态</th><th>操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.florrId}{user.isAdmin && <ShieldCheck size={14} />}</td><td>{user.level ?? 1}</td><td>{user.isFlorrVerified ? '已绑定' : '未绑定'}</td><td className="ban-id-cell">{user.banId ?? '-'}</td><td><span className={`admin-status ${user.isBanned ? 'is-banned' : ''}`}>{user.isBanned ? '已封禁' : '正常'}</span></td><td><div className="admin-actions"><button type="button" disabled={user.isAdmin} onClick={() => void toggleBan(user)}><Ban size={15} />{user.isBanned ? '解封' : '封禁'}</button><button type="button" onClick={() => setPasswordUser(user)}><KeyRound size={15} />改密码</button><button className="admin-delete-button" type="button" disabled={user.isAdmin} onClick={() => setDeleteUser(user)}><Trash2 size={15} />删除</button></div></td></tr>)}</tbody></table></div></section>}

      {tab === 'images' && <section className="admin-panel"><div className="admin-panel-heading image-toolbar"><div><h2>图片资源</h2><p>{images.length} 张当前页截图</p></div><div><label className="select-all"><input type="checkbox" checked={allSelected} onChange={() => setSelectedImages(allSelected ? [] : images.map((item) => item.id))} />全选当前页</label><button className="button-danger" type="button" disabled={selectedImages.length === 0} onClick={() => void deleteSelected()}><Trash2 size={16} />批量删除 ({selectedImages.length})</button></div></div>{images.length === 0 ? <div className="admin-empty"><Images size={30} /><strong>暂无图片资源</strong></div> : <><div className="resource-grid">{images.map((item) => <article className={`resource-item ${selectedImages.includes(item.id) ? 'selected' : ''}`} key={item.id}><label className="resource-check"><input type="checkbox" checked={selectedImages.includes(item.id)} onChange={() => setSelectedImages((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span /></label><button className="resource-preview" type="button" onClick={() => setLightbox(item)}><img src={imageUrl(item.id)} alt="绑定截图" /></button><div><strong>{item.user?.florrId}</strong><span>用户 #{item.user?.id} · {formatSize(item.screenshotSize)}</span><small>通过于 {formatDate(item.reviewedAt)}</small></div><button className="icon-button resource-delete" type="button" onClick={() => void deleteImage(item.id)} title="删除图片"><Trash2 size={16} /></button></article>)}</div><Pagination page={imagesPage} lastPage={imagesLastPage} onPage={(page) => void loadImages(page)} /></>}</section>}
    </main>

    {lightbox && <div className="modal-backdrop image-lightbox" onMouseDown={(event) => event.target === event.currentTarget && setLightbox(null)}><section role="dialog" aria-modal="true"><button className="icon-button" onClick={() => setLightbox(null)} title="关闭"><XCircle size={21} /></button><img src={imageUrl(lightbox.id)} alt={`${lightbox.user?.florrId} 的完整游戏截图`} /><p>用户 #{lightbox.user?.id} · {lightbox.user?.florrId}</p></section></div>}
    {rejecting && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><h2>拒绝 {rejecting.user?.florrId} 的申请</h2></div><form onSubmit={submitReject}><label>拒绝原因<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} maxLength={500} rows={4} autoFocus required placeholder="说明截图中缺少或无法核对的内容" /></label><span className="field-count">{rejectReason.length}/500</span><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => { setRejecting(null); setRejectReason('') }}>取消</button><button type="submit" className="button-danger" disabled={!rejectReason.trim() || busyId === rejecting.id}>确认拒绝</button></div></form></section></div>}
    {passwordUser && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><h2>修改 {passwordUser.florrId} 的密码</h2></div><form onSubmit={savePassword}><label>新密码<input type="password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setPasswordUser(null)}>取消</button><button type="submit" className="button-primary">保存</button></div></form></section></div>}
    {deleteUser && <div className="modal-backdrop"><section className="modal admin-delete-dialog" role="alertdialog" aria-modal="true"><div className="modal-header"><h2>删除账户</h2></div><p>确定永久删除账户 <strong>{deleteUser.florrId}</strong>？相关申请和图片也会一并删除。</p><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setDeleteUser(null)}>取消</button><button type="button" className="button-danger" onClick={() => void confirmDelete()}><Trash2 size={16} />确认删除</button></div></section></div>}
    <ErrorDialog message={error} onClose={() => setError('')} />
  </div>
}

function Pagination({ page, lastPage, onPage }: { page: number; lastPage: number; onPage: (page: number) => void }) {
  if (lastPage <= 1) return null
  return <nav className="admin-pagination" aria-label="分页"><button className="button-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button><span>{page} / {lastPage}</span><button className="button-secondary" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>下一页</button></nav>
}
