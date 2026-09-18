'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, CreditCard, PiggyBank, Plus, Truck, Wallet, WalletCards } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { LoadError } from '@/components/load-error'
import { fetchJson } from '@/lib/fetch-json'

const periods = ['Aujourd’hui', '7 derniers jours', 'Ce mois-ci']

type PaymentRow = { date: string; client: string; store: string; amount: string; method: 'cash' | 'mobile_money' | 'bank_transfer' | 'check' }
type TreasuryData = {
  payments: PaymentRow[]
  summary: {
    totalEncaisse: string
    cashSales: string
    totalPayments: string
    outstandingReceivables: string
    totalSupplierPayments: string
    outstandingPayables: string
  }
  stores: string[]
}
type StoreOption = { id: number; name: string }
type ClientOption = { id: number; name: string }

const methodLabel = { cash: 'Espèces', mobile_money: 'Mobile Money', bank_transfer: 'Virement', check: 'Chèque' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Wallet; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function NewPaymentForm({ storeOptions, clientOptions, onCreated }: { storeOptions: StoreOption[]; clientOptions: ClientOption[]; onCreated: () => void }) {
  const [clientId, setClientId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'mobile_money' | 'bank_transfer' | 'check'>('cash')
  const [storeId, setStoreId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!storeId && storeOptions.length > 0) setStoreId(String(storeOptions[0].id))
  }, [storeOptions, storeId])
  useEffect(() => {
    if (!clientId && clientOptions.length > 0) setClientId(String(clientOptions[0].id))
  }, [clientOptions, clientId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/tresorerie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, amount, method, storeId }),
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
      <div className="form-field">
        <label>Client</label>
        <select required value={clientId} onChange={(event) => setClientId(event.target.value)}>
          {clientOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-field"><label>Montant (FCFA)</label><input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
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
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer l’encaissement'}</button></div>
    </form>
  )
}

export function TreasuryView() {
  const [period, setPeriod] = useState(periods[1])
  const [store, setStore] = useState('Tous les magasins')
  const [data, setData] = useState<TreasuryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ period, store })
    fetchJson<TreasuryData>(`/api/tresorerie?${params.toString()}`)
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, store, refreshKey])

  useEffect(() => {
    fetchJson<{ stores: StoreOption[] }>('/api/magasins').then((json) => setStoreOptions(json.stores)).catch(() => {})
    fetchJson<{ clients: ClientOption[] }>('/api/clients/options').then((json) => setClientOptions(json.clients)).catch(() => {})
  }, [refreshKey])

  const stores = data?.stores ?? ['Tous les magasins']

  return (
    <AppShell breadcrumb="Pilotage" section="Trésorerie">
      <section className="page-heading">
        <div><p className="eyebrow">ENCAISSEMENTS</p><h1>Trésorerie <span>et paiements</span></h1><p className="heading-subtitle">Suivez les encaissements et le solde des créances.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Période</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
          <label className="select-wrap"><span className="sr-only">Magasin</span><select value={store} onChange={(event) => setStore(event.target.value)}>{stores.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
        </div>
      </section>

      {error && <LoadError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}

      <section className="metrics-grid" aria-label="Indicateurs trésorerie">
        <MetricCard label="Total encaissé" value={data ? data.summary.totalEncaisse : '—'} icon={WalletCards} tone="navy" />
        <MetricCard label="Ventes comptant" value={data ? data.summary.cashSales : '—'} icon={Wallet} tone="green" />
        <MetricCard label="Paiements de créances" value={data ? data.summary.totalPayments : '—'} icon={CreditCard} tone="blue" />
        <MetricCard label="Solde créances" value={data ? data.summary.outstandingReceivables : '—'} icon={PiggyBank} tone="orange" />
        <MetricCard label="Payé au fournisseur" value={data ? data.summary.totalSupplierPayments : '—'} icon={Truck} tone="blue" />
        <MetricCard label="Dû au fournisseur" value={data ? data.summary.outstandingPayables : '—'} icon={Truck} tone="orange" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-spacer" />
        <button className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> Nouvel encaissement</button>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Magasin</th>
                <th>Méthode</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {(data?.payments ?? []).map((payment, index) => (
                <tr key={`${payment.date}-${index}`}>
                  <td>{new Date(payment.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{payment.client}</td>
                  <td>{payment.store}</td>
                  <td>{methodLabel[payment.method]}</td>
                  <td>{payment.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && (data?.payments.length ?? 0) === 0 && <p className="table-empty">Aucun paiement enregistré sur cette période.</p>}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvel encaissement" subtitle="Enregistrez un paiement reçu d’un client.">
        <NewPaymentForm
          storeOptions={storeOptions}
          clientOptions={clientOptions}
          onCreated={() => { setModalOpen(false); setRefreshKey((key) => key + 1) }}
        />
      </Modal>
    </AppShell>
  )
}
