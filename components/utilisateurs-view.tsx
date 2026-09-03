'use client'

import { useEffect, useState } from 'react'
import { Plus, ShieldCheck, Users } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'

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

export function UtilisateursView() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
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

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>Magasin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id}>
                  <td data-label="Nom">{row.name}</td>
                  <td data-label="E-mail">{row.email}</td>
                  <td data-label="Rôle"><span className={`badge ${roleBadge[row.role] ?? 'badge-muted'}`}>{roleLabel[row.role] ?? row.role}</span></td>
                  <td data-label="Magasin">{row.role === 'admin' ? 'Tous les magasins' : row.store}</td>
                </tr>
              ))}
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
    </AppShell>
  )
}
