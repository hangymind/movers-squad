import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Ban, KeyRound, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, getErrorMessage } from '../lib/api'
import { ErrorDialog } from '../components/ErrorDialog'
import type { User } from '../types'

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [password, setPassword] = useState('')
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  const loadUsers = useCallback(async (query = '') => {
    try { const { data } = await api.get<{ data: User[] }>('/admin/users', { params: { search: query || undefined } }); setUsers(data.data) }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }, [])
  // Loading the protected user list is the synchronization this effect owns.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadUsers() }, [loadUsers])
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
    try {
      await api.delete(`/admin/users/${deleteUser.id}`)
      setUsers((current) => current.filter((user) => user.id !== deleteUser.id))
      setDeleteUser(null)
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }

  return <div className="admin-page">
    <header className="admin-header"><Link to="/" className="icon-button" title="返回大厅"><ArrowLeft size={19} /></Link><div><span className="eyebrow">MOVERS CONTROL</span><h1>用户管理</h1></div></header>
    <main className="admin-main">
      <form className="admin-search" onSubmit={submitSearch}><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 Florr ID 或 Ban ID" /><button className="button-primary" type="submit">搜索</button></form>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Florr ID</th><th>等级</th><th>Ban ID</th><th>状态</th><th>操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.florrId}{user.isAdmin && <ShieldCheck size={14} />}</td><td>{user.level ?? 1}</td><td className="ban-id-cell">{user.banId ?? '-'}</td><td><span className={`admin-status ${user.isBanned ? 'is-banned' : ''}`}>{user.isBanned ? '已封禁' : '正常'}</span></td><td><div className="admin-actions"><button type="button" disabled={user.isAdmin} onClick={() => void toggleBan(user)}><Ban size={15} />{user.isBanned ? '解封' : '封禁'}</button><button type="button" onClick={() => setPasswordUser(user)}><KeyRound size={15} />改密码</button><button className="admin-delete-button" type="button" disabled={user.isAdmin} onClick={() => setDeleteUser(user)}><Trash2 size={15} />删除</button></div></td></tr>)}</tbody></table></div>
    </main>
    {passwordUser && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><h2>修改 {passwordUser.florrId} 的密码</h2></div><form onSubmit={savePassword}><label>新密码<input type="password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setPasswordUser(null)}>取消</button><button type="submit" className="button-primary">保存</button></div></form></section></div>}
    {deleteUser && <div className="modal-backdrop"><section className="modal admin-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title"><div className="modal-header"><h2 id="delete-user-title">删除账户</h2></div><p>确定永久删除账户 <strong>{deleteUser.florrId}</strong>？该用户创建的队伍和成员关系也会一并删除，此操作无法撤销。</p><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setDeleteUser(null)}>取消</button><button type="button" className="button-danger admin-confirm-delete" onClick={() => void confirmDelete()}><Trash2 size={16} />确认删除</button></div></section></div>}
    <ErrorDialog message={error} onClose={() => setError('')} />
  </div>
}
