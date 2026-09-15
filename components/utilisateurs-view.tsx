'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { authClient } from '@/lib/auth-client'

type UserRow = { id: string; name: string; email: string; role: string; storeId: number | null; store: string }
type StoreOption = { id: number; name: string }

const roleLabel: Record<string, string> = { admin: 'Administrateur', gestionnaire: 'Gestionnaire' }
const roleBadge: Record<string, string> = { admin: 'badge-blue', gestionnaire: 'badge-green' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Users; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function NewUserForm({ storeOptions, onCreated }: { storeOptions: StoreOption[]; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'gestionnaire'>('gestionnaire')
  const [storeId, setStoreId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!storeId && storeOptions.length > 0) setStoreId(String(storeOptions[0].id))
  }, [storeOptions, storeId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/utilisateurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role, storeId: role === 'gestionnaire' ? storeId : null }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <div className="form-field"><label>Nom complet</label><input required value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="form-field"><label>Adresse e-mail</label><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      <div className="form-field"><label>Mot de passe</label><input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
      <div className="form-row">
        <div className="form-field">
          <label>Rôle</label>
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="gestionnaire">Gestionnaire</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        {role === 'gestionnaire' && (
          <div className="form-field">
            <label>Magasin</label>
            <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Création...' : 'Créer le compte'}</button></div>
    </form>
  )
}

function EditUserForm({
  targetUser,
  storeOptions,
  onSaved,
}: {
  targetUser: UserRow
  storeOptions: StoreOption[]
  onSaved: () => void
}) {
  const [role, setRole] = useState<'admin' | 'gestionnaire'>(targetUser.role === 'admin' ? 'admin' : 'gestionnaire')
  const [storeId, setStoreId] = useState(targetUser.storeId ? String(targetUser.storeId) : '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (role === 'gestionnaire' && !storeId && storeOptions.length > 0) setStoreId(String(storeOptions[0].id))
  }, [role, storeId, storeOptions])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/utilisateurs/${targetUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, storeId: role === 'gestionnaire' ? storeId : null }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <div className="form-field"><label>Nom</label><input disabled value={targetUser.name} /></div>
      <div className="form-field"><label>E-mail</label><input disabled value={targetUser.email} /></div>
      <div className="form-row">
        <div className="form-field">
          <label>Rôle</label>
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="gestionnaire">Gestionnaire</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        {role === 'gestionnaire' && (
          <div className="form-field">
            <label>Magasin</label>
            <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</button></div>
    </form>
  )
}

export function UtilisateursView() {
  const { data: session } = authClient.useSession()
  const [users, setUsers] = useState<UserRow[]>([])
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/utilisateurs')
      .then((res) => res.json())
      .then((json: { users: UserRow[] }) => {
        if (!cancelled) setUsers(json.users ?? [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    fetch('/api/magasins').then((res) => res.json()).then((json: { stores: StoreOption[] }) => setStoreOptions(json.stores))
  }, [refreshKey])

  const adminCount = users.filter((u) => u.role === 'admin').length
  const currentUserId = session?.user?.id

  async function handleDelete(id: string) {
    setDeleteError('')
    setDeletingId(id)
    try {
      const res = await fetch(`/api/utilisateurs/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setDeleteError(json.error ?? 'Une erreur est survenue.')
        return
      }
      setRefreshKey((key) => key + 1)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <AppShell breadcrumb="Administration" section="Utilisateurs">
      <section className="page-heading">
        <div><p className="eyebrow">ACCÈS</p><h1>Utilisateurs <span>et permissions</span></h1><p className="heading-subtitle">Gérez les comptes administrateurs et gestionnaires de magasin.</p></div>
      </section>

      <section className="metrics-grid" aria-label="Indicateurs utilisateurs">
        <MetricCard label="Total comptes" value={`${users.length}`} icon={Users} tone="navy" />
        <MetricCard label="Administrateurs" value={`${adminCount}`} icon={ShieldCheck} tone="blue" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-spacer" />
        <button className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> Nouvel utilisateur</button>
      </div>

      {deleteError && <p className="form-error">{deleteError}</p>}

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>Magasin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => {
                const isSelf = row.id === currentUserId
                return (
                  <tr key={row.id}>
                    <td data-label="Nom">{row.name}</td>
                    <td data-label="E-mail">{row.email}</td>
                    <td data-label="Rôle"><span className={`badge ${roleBadge[row.role] ?? 'badge-muted'}`}>{roleLabel[row.role] ?? row.role}</span></td>
                    <td data-label="Magasin">{row.role === 'admin' ? 'Tous les magasins' : row.store}</td>
                    <td data-label="" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="icon-button"
                        title="Modifier"
                        aria-label={`Modifier ${row.name}`}
                        onClick={() => setEditingUser(row)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title={isSelf ? 'Vous ne pouvez pas supprimer votre propre compte' : 'Supprimer'}
                        aria-label={`Supprimer ${row.name}`}
                        disabled={isSelf || deletingId === row.id}
                        onClick={() => {
                          if (window.confirm(`Supprimer le compte de ${row.name} ? Cette action est irréversible.`)) {
                            handleDelete(row.id)
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && users.length === 0 && <p className="table-empty">Aucun utilisateur.</p>}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvel utilisateur" subtitle="Créez un accès administrateur ou gestionnaire de magasin.">
        <NewUserForm
          storeOptions={storeOptions}
          onCreated={() => {
            setModalOpen(false)
            setRefreshKey((key) => key + 1)
          }}
        />
      </Modal>

      <Modal open={editingUser !== null} onClose={() => setEditingUser(null)} title="Modifier l’utilisateur" subtitle="Changez le rôle ou le magasin assigné.">
        {editingUser && (
          <EditUserForm
            targetUser={editingUser}
            storeOptions={storeOptions}
            onSaved={() => {
              setEditingUser(null)
              setRefreshKey((key) => key + 1)
            }}
          />
        )}
      </Modal>
    </AppShell>
  )
}
