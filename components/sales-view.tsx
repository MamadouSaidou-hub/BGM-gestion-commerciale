'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, CreditCard, Plus, Receipt, Search, ShoppingCart, Trash2, WalletCards } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { LoadError } from '@/components/load-error'
import { downloadCsv } from '@/lib/download-csv'
import { fetchJson } from '@/lib/fetch-json'

const periods = ['Aujourd’hui', '7 derniers jours', 'Ce mois-ci']

type Sale = {
  reference: string
  date: string
  store: string
  client: string
  amount: string
  status: 'paid' | 'partial' | 'credit'
}

type SalesData = {
  sales: Sale[]
  summary: { count: number; totalRevenue: string; avgBasket: string; creditCount: number }
  stores: string[]
}

type StoreOption = { id: number; name: string }
type ClientOption = { id: number; name: string }
type ProductOption = { id: number; name: string; sku: string; unitPrice: number; sackWeightKg: number | null }
type ItemRow = { productId: string; quantity: string; unitPrice: string; unit: 'sack' | 'tonne'; tonnage: string }

const statusLabel = { paid: 'Payée', partial: 'Partielle', credit: 'Crédit' }
const statusBadge = { paid: 'badge-green', partial: 'badge-orange', credit: 'badge-blue' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof ShoppingCart; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function NewSaleForm({
  storeOptions,
  clientOptions,
  productOptions,
  onCreated,
}: {
  storeOptions: StoreOption[]
  clientOptions: ClientOption[]
  productOptions: ProductOption[]
  onCreated: () => void
}) {
  const [storeId, setStoreId] = useState('')
  const [clientId, setClientId] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'credit'>('paid')
  const [paidNow, setPaidNow] = useState('')
  const [dueInDays, setDueInDays] = useState('15')
  const [items, setItems] = useState<ItemRow[]>([{ productId: '', quantity: '1', unitPrice: '', unit: 'sack', tonnage: '' }])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!storeId && storeOptions.length > 0) setStoreId(String(storeOptions[0].id))
  }, [storeOptions, storeId])

  const productMap = useMemo(() => new Map(productOptions.map((product) => [String(product.id), product])), [productOptions])

  function effectiveSacks(item: ItemRow) {
    if (item.unit === 'tonne') {
      const product = productMap.get(item.productId)
      if (!product?.sackWeightKg) return 0
      return Math.round(((Number(item.tonnage) || 0) * 1000) / product.sackWeightKg)
    }
    return Number(item.quantity) || 0
  }

  const total = items.reduce((sum, item) => sum + effectiveSacks(item) * (Number(item.unitPrice) || 0), 0)

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function handleProductChange(index: number, productId: string) {
    const product = productMap.get(productId)
    updateItem(index, { productId, unitPrice: product ? String(product.unitPrice) : '', unit: 'sack', tonnage: '' })
  }

  function addItem() {
    setItems((rows) => [...rows, { productId: '', quantity: '1', unitPrice: '', unit: 'sack', tonnage: '' }])
  }

  function removeItem(index: number) {
    setItems((rows) => rows.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (paymentStatus !== 'paid' && !clientId) {
      setError('Un client est requis pour une vente partielle ou à crédit.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/ventes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          clientId: clientId || null,
          paymentStatus,
          paidNow: paymentStatus === 'partial' ? paidNow : 0,
          dueInDays,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.unit === 'tonne' ? effectiveSacks(item) : item.quantity,
            unitPrice: item.unitPrice,
            unit: item.unit,
            tonnage: item.unit === 'tonne' ? item.tonnage : undefined,
          })),
        }),
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
      <div className="form-row">
        <div className="form-field">
          <label>Magasin</label>
          <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Client (optionnel)</label>
          <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Vente comptoir</option>
            {clientOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
      </div>

      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Articles</label>
      {items.map((item, index) => {
        const product = productMap.get(item.productId)
        const canUseTonne = Boolean(product?.sackWeightKg)
        return (
          <div key={index} style={{ marginBottom: 10 }}>
            <div className="item-row-grid">
              <div className="form-field" style={{ marginBottom: 0 }}>
                <select required value={item.productId} onChange={(event) => handleProductChange(index, event.target.value)}>
                  <option value="">Sélectionner...</option>
                  {productOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </div>
              {item.unit === 'tonne' ? (
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <input required type="number" min="0.01" step="0.01" placeholder="Tonnage" value={item.tonnage} onChange={(event) => updateItem(index, { tonnage: event.target.value })} />
                </div>
              ) : (
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <input required type="number" min="1" placeholder="Qté (sacs)" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                </div>
              )}
              <div className="form-field" style={{ marginBottom: 0 }}><input required type="number" min="0" placeholder="Prix" value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: event.target.value })} /></div>
              <button type="button" className="item-row-remove" onClick={() => removeItem(index)} disabled={items.length === 1} aria-label="Retirer la ligne"><Trash2 size={14} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                <input
                  type="radio"
                  name={`unit-${index}`}
                  checked={item.unit === 'sack'}
                  onChange={() => updateItem(index, { unit: 'sack', tonnage: '' })}
                /> Sac
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: canUseTonne ? 'var(--muted)' : 'var(--muted-light, #ccc)' }}>
                <input
                  type="radio"
                  name={`unit-${index}`}
                  disabled={!canUseTonne}
                  checked={item.unit === 'tonne'}
                  onChange={() => updateItem(index, { unit: 'tonne', quantity: '' })}
                /> Tonne
              </label>
              {item.unit === 'tonne' && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>≈ {effectiveSacks(item)} sac(s)</span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" className="item-add-link" onClick={addItem}><Plus size={13} /> Ajouter un article</button>

      <div className="sale-total-row"><span>Total</span><span>{total.toLocaleString('fr-FR')} FCFA</span></div>

      <div className="form-row">
        <div className="form-field">
          <label>Statut de paiement</label>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}>
            <option value="paid">Payée comptant</option>
            <option value="partial">Paiement partiel</option>
            <option value="credit">À crédit</option>
          </select>
        </div>
        {paymentStatus === 'partial' && (
          <div className="form-field"><label>Montant payé maintenant</label><input required type="number" min="0" max={total} value={paidNow} onChange={(event) => setPaidNow(event.target.value)} /></div>
        )}
        {paymentStatus !== 'paid' && (
          <div className="form-field"><label>Échéance (jours)</label><input required type="number" min="1" value={dueInDays} onChange={(event) => setDueInDays(event.target.value)} /></div>
        )}
      </div>

      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer la vente'}</button></div>
    </form>
  )
}

export function SalesView() {
  const [period, setPeriod] = useState(periods[1])
  const [store, setStore] = useState('Tous les magasins')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<SalesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ period, store })
    fetchJson<SalesData>(`/api/ventes?${params.toString()}`)
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
    fetchJson<{ products: ProductOption[] }>('/api/products').then((json) => setProductOptions(json.products)).catch(() => {})
  }, [refreshKey])

  const stores = data?.stores ?? ['Tous les magasins']
  const filteredSales = useMemo(() => {
    const rows = data?.sales ?? []
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => row.reference.toLowerCase().includes(query) || row.client.toLowerCase().includes(query))
  }, [data, search])

  return (
    <AppShell breadcrumb="Pilotage" section="Ventes" onExport={() => downloadCsv(`/api/ventes?${new URLSearchParams({ period, store, format: 'csv' }).toString()}`, 'ventes.csv')}>
      <section className="page-heading">
        <div><p className="eyebrow">TRANSACTIONS</p><h1>Ventes <span>par magasin</span></h1><p className="heading-subtitle">Consultez l’historique des ventes sur la période sélectionnée.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Période</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
          <label className="select-wrap"><span className="sr-only">Magasin</span><select value={store} onChange={(event) => setStore(event.target.value)}>{stores.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
        </div>
      </section>

      {error && <LoadError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}

      <section className="metrics-grid" aria-label="Indicateurs ventes">
        <MetricCard label="Nombre de ventes" value={data ? `${data.summary.count}` : '—'} icon={ShoppingCart} tone="navy" />
        <MetricCard label="Chiffre d’affaires" value={data ? data.summary.totalRevenue : '—'} icon={WalletCards} tone="green" />
        <MetricCard label="Panier moyen" value={data ? data.summary.avgBasket : '—'} icon={Receipt} tone="blue" />
        <MetricCard label="Ventes à crédit" value={data ? `${data.summary.creditCount}` : '—'} icon={CreditCard} tone="orange" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-search">
          <Search aria-hidden="true" />
          <input placeholder="Rechercher une référence, un client..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher une vente" />
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> Nouvelle vente</button>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Date</th>
                <th>Magasin</th>
                <th>Client</th>
                <th>Montant</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.reference}>
                  <td data-label="Référence">#{sale.reference}</td>
                  <td data-label="Date">{new Date(sale.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td data-label="Magasin">{sale.store}</td>
                  <td data-label="Client">{sale.client}</td>
                  <td data-label="Montant">{sale.amount}</td>
                  <td data-label="Statut"><span className={`badge ${statusBadge[sale.status]}`}>{statusLabel[sale.status]}</span></td>
                  <td><a className="btn-ghost" href={`/ventes/${sale.reference}/facture`} target="_blank" rel="noopener noreferrer"><Receipt size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Facture</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredSales.length === 0 && <p className="table-empty">Aucune vente sur cette période.</p>}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle vente" subtitle="Enregistrez une vente et mettez à jour le stock automatiquement." wide>
        <NewSaleForm
          storeOptions={storeOptions}
          clientOptions={clientOptions}
          productOptions={productOptions}
          onCreated={() => {
            setModalOpen(false)
            setRefreshKey((key) => key + 1)
          }}
        />
      </Modal>
    </AppShell>
  )
}
