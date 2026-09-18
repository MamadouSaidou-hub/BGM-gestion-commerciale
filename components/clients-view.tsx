'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CreditCard, Percent, Plus, Search, Users, Wallet, WalletCards } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { DiscountScaleModal } from '@/components/discount-scale-modal'
import { LoadError } from '@/components/load-error'
import { authClient } from '@/lib/auth-client'
import { downloadCsv } from '@/lib/download-csv'
import { fetchJson } from '@/lib/fetch-json'

type Client = {
  id: number
  name: string
  phone: string
  storeId: number | null
  store: string
  outstanding: string
  totalPaid: string
  status: 'ok' | 'pending' | 'overdue'
}

type ClientsData = {
  clients: Client[]
  summary: { totalClients: number; totalOutstanding: string; overdueCount: number }
}

type StoreOption = { id: number; name: string }

const statusLabel = { ok: 'À jour', pending: 'En cours', overdue: 'En retard' }
const statusBadge = { ok: 'badge-green', pending: 'badge-blue', overdue: 'badge-red' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Users; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function NewClientForm({ storeOptions, onCreated }: { storeOptions: StoreOption[]; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [storeId, setStoreId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, storeId: storeId || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      onCreated()
    } catch {
      setError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <div className="form-field"><label>Nom du client</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex : Boutique Fatima" /></div>
      <div className="form-field"><label>Téléphone</label><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="6XX XX XX XX" /></div>
      <div className="form-field">
        <label>Magasin habituel (optionnel)</label>
        <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          <option value="">—</option>
          {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Création...' : 'Créer le client'}</button></div>
    </form>
  )
}

function RecordPaymentForm({ client, storeOptions, onCreated }: { client: Client; storeOptions: StoreOption[]; onCreated: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'mobile_money' | 'bank_transfer' | 'check'>('cash')
  const [storeId, setStoreId] = useState(String(client.storeId ?? storeOptions[0]?.id ?? ''))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/tresorerie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, amount, method, storeId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      onCreated()
    } catch {
      setError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <p className="section-subtitle">Créance en cours : <strong>{client.outstanding}</strong></p>
      <div className="form-row">
        <div className="form-field"><label>Montant encaissé (FCFA)</label><input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="form-field">
          <label>Méthode</label>
          <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="cash">Espèces</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="bank_transfer">Virement</option>
            <option value="check">Chèque</option>
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Magasin d’encaissement</label>
        <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer le paiement'}</button></div>
    </form>
  )
}

export function ClientsView() {
  const { data: session } = authClient.useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [search, setSearch] = useState('')
  const [data, setData] = useState<ClientsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [paymentClient, setPaymentClient] = useState<Client | null>(null)
  const [discountClient, setDiscountClient] = useState<Client | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    fetchJson<ClientsData>('/api/clients')
      .then((json) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue.'))
      .finally(() => setLoading(false))
    fetchJson<{ stores: StoreOption[] }>('/api/magasins').then((json) => setStoreOptions(json.stores)).catch(() => {})
  }, [refreshKey])

  const filteredClients = useMemo(() => {
    const rows = data?.clients ?? []
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => row.name.toLowerCase().includes(query) || row.phone.toLowerCase().includes(query))
  }, [data, search])

  return (
    <AppShell breadcrumb="Gestion" section="Clients & créances" onExport={() => downloadCsv('/api/clients?format=csv', 'clients.csv')}>
      <section className="page-heading">
        <div><p className="eyebrow">RECOUVREMENT</p><h1>Clients <span>et créances</span></h1><p className="heading-subtitle">Suivez les soldes clients et les échéances de paiement.</p></div>
      </section>

      {error && <LoadError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}

      <section className="metrics-grid" aria-label="Indicateurs clients" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <MetricCard label="Clients suivis" value={data ? `${data.summary.totalClients}` : '—'} icon={Users} tone="navy" />
        <MetricCard label="Créances en cours" value={data ? data.summary.totalOutstanding : '—'} icon={Wallet} tone="blue" />
        <MetricCard label="Clients en retard" value={data ? `${data.summary.overdueCount}` : '—'} icon={AlertTriangle} tone="orange" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-search">
          <Search aria-hidden="true" />
          <input placeholder="Rechercher un client, un téléphone..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un client" />
        </div>
        <button className="btn-primary" onClick={() => setClientModalOpen(true)}><Plus size={14} /> Nouveau client</button>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Téléphone</th>
                <th>Magasin</th>
                <th>Encaissé au total</th>
                <th>Créance en cours</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr key={client.id}>
                  <td data-label="Client"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={13} color="var(--faint)" />{client.name}</span></td>
                  <td data-label="Téléphone">{client.phone}</td>
                  <td data-label="Magasin">{client.store}</td>
                  <td data-label="Encaissé">{client.totalPaid}</td>
                  <td data-label="Créance">{client.outstanding}</td>
                  <td data-label="Statut"><span className={`badge ${statusBadge[client.status]}`}>{statusLabel[client.status]}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {client.status !== 'ok' && (
                      <button className="btn-ghost" onClick={() => setPaymentClient(client)}><WalletCards size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Encaisser</button>
                    )}
                    {isAdmin && (
                      <button className="btn-ghost" onClick={() => setDiscountClient(client)}><Percent size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Barème</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredClients.length === 0 && <p className="table-empty">Aucun client trouvé.</p>}
        </div>
      </div>

      <Modal open={clientModalOpen} onClose={() => setClientModalOpen(false)} title="Nouveau client" subtitle="Ajoutez un client à votre portefeuille.">
        <NewClientForm storeOptions={storeOptions} onCreated={() => { setClientModalOpen(false); setRefreshKey((key) => key + 1) }} />
      </Modal>
      <Modal open={paymentClient !== null} onClose={() => setPaymentClient(null)} title={`Encaisser — ${paymentClient?.name ?? ''}`} subtitle="Enregistrez un paiement contre la créance de ce client.">
        {paymentClient && (
          <RecordPaymentForm
            client={paymentClient}
            storeOptions={storeOptions}
            onCreated={() => { setPaymentClient(null); setRefreshKey((key) => key + 1) }}
          />
        )}
      </Modal>
      {discountClient && (
        <DiscountScaleModal
          open={discountClient !== null}
          onClose={() => setDiscountClient(null)}
          partyType="client"
          partyId={discountClient.id}
          partyName={discountClient.name}
        />
      )}
    </AppShell>
  )
}
