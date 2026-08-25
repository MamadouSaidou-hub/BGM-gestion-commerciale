'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Boxes, ChevronDown, Clock, Plus, Search, Trash2, Truck } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { downloadCsv } from '@/lib/download-csv'

const periods = ['Aujourd’hui', '7 derniers jours', 'Ce mois-ci']

type Transfer = {
  id: number
  reference: string
  date: string
  fromStore: string
  toStore: string
  status: 'pending' | 'in_transit' | 'completed'
  itemCount: number
  totalQuantity: number
}

type TransfersData = {
  transfers: Transfer[]
  summary: { count: number; pendingCount: number; totalQuantity: number }
  stores: string[]
}

type StoreOption = { id: number; name: string }
type ProductOption = { id: number; name: string; sku: string }
type ItemRow = { productId: string; quantity: string }

const statusLabel = { pending: 'En attente', in_transit: 'En transit', completed: 'Reçu' }
const statusBadge = { pending: 'badge-orange', in_transit: 'badge-blue', completed: 'badge-green' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof ArrowLeftRight; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function NewTransferForm({
  storeOptions,
  productOptions,
  onCreated,
}: {
  storeOptions: StoreOption[]
  productOptions: ProductOption[]
  onCreated: () => void
}) {
  const [fromStoreId, setFromStoreId] = useState('')
  const [toStoreId, setToStoreId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([{ productId: '', quantity: '1' }])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!fromStoreId && storeOptions.length > 0) setFromStoreId(String(storeOptions[0].id))
    if (!toStoreId && storeOptions.length > 1) setToStoreId(String(storeOptions[1].id))
  }, [storeOptions, fromStoreId, toStoreId])

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addItem() {
    setItems((rows) => [...rows, { productId: '', quantity: '1' }])
  }

  function removeItem(index: number) {
    setItems((rows) => rows.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (fromStoreId === toStoreId) {
      setError('Le magasin de destination doit être différent du magasin d’origine.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/transferts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStoreId,
          toStoreId,
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
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
          <label>Magasin d’origine</label>
          <select required value={fromStoreId} onChange={(event) => setFromStoreId(event.target.value)}>
            {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Magasin de destination</label>
          <select required value={toStoreId} onChange={(event) => setToStoreId(event.target.value)}>
            {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
      </div>

      <label style={{ fontSize: 10, fontWeight: 700, color: '#53647a', display: 'block', marginBottom: 6 }}>Articles</label>
      {items.map((item, index) => (
        <div className="item-row-grid" style={{ gridTemplateColumns: '2fr 1fr auto' }} key={index}>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <select required value={item.productId} onChange={(event) => updateItem(index, { productId: event.target.value })}>
              <option value="">Sélectionner...</option>
              {productOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}><input required type="number" min="1" placeholder="Qté" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} /></div>
          <button type="button" className="item-row-remove" onClick={() => removeItem(index)} disabled={items.length === 1} aria-label="Retirer la ligne"><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" className="item-add-link" onClick={addItem}><Plus size={13} /> Ajouter un article</button>

      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Lancer le transfert'}</button></div>
    </form>
  )
}

export function TransfertsView() {
  const [period, setPeriod] = useState(periods[1])
  const [store, setStore] = useState('Tous les magasins')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<TransfersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [receivingId, setReceivingId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ period, store })
    fetch(`/api/transferts?${params.toString()}`)
      .then((res) => res.json())
      .then((json: TransfersData) => {
        if (!cancelled) setData(json)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, store, refreshKey])

  useEffect(() => {
    fetch('/api/magasins').then((res) => res.json()).then((json: { stores: StoreOption[] }) => setStoreOptions(json.stores))
    fetch('/api/products').then((res) => res.json()).then((json: { products: ProductOption[] }) => setProductOptions(json.products))
  }, [refreshKey])

  const stores = data?.stores ?? ['Tous les magasins']
  const filteredTransfers = useMemo(() => {
    const rows = data?.transfers ?? []
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => row.reference.toLowerCase().includes(query) || row.fromStore.toLowerCase().includes(query) || row.toStore.toLowerCase().includes(query))
  }, [data, search])

  async function handleReceive(id: number) {
    setReceivingId(id)
    try {
      const res = await fetch(`/api/transferts/${id}/receive`, { method: 'POST' })
      if (res.ok) setRefreshKey((key) => key + 1)
    } finally {
      setReceivingId(null)
    }
  }

  return (
    <AppShell breadcrumb="Pilotage" section="Transferts" onExport={() => downloadCsv(`/api/transferts?${new URLSearchParams({ period, store, format: 'csv' }).toString()}`, 'transferts.csv')}>
      <section className="page-heading">
        <div><p className="eyebrow">LOGISTIQUE</p><h1>Transferts <span>entre magasins</span></h1><p className="heading-subtitle">Suivez les transferts de stock entre magasins.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Période</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
          <label className="select-wrap"><span className="sr-only">Magasin</span><select value={store} onChange={(event) => setStore(event.target.value)}>{stores.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Indicateurs transferts">
        <MetricCard label="Nombre de transferts" value={data ? `${data.summary.count}` : '—'} icon={ArrowLeftRight} tone="navy" />
        <MetricCard label="En cours" value={data ? `${data.summary.pendingCount}` : '—'} icon={Truck} tone="orange" />
        <MetricCard label="Articles transférés" value={data ? `${data.summary.totalQuantity}` : '—'} icon={Boxes} tone="blue" />
        <MetricCard label="Terminés" value={data ? `${data.summary.count - data.summary.pendingCount}` : '—'} icon={Clock} tone="green" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-search">
          <Search aria-hidden="true" />
          <input placeholder="Rechercher une référence, un magasin..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un transfert" />
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> Nouveau transfert</button>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Date</th>
                <th>Origine</th>
                <th>Destination</th>
                <th>Articles</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredTransfers.map((transfer) => (
                <tr key={transfer.reference}>
                  <td>#{transfer.reference}</td>
                  <td>{new Date(transfer.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{transfer.fromStore}</td>
                  <td>{transfer.toStore}</td>
                  <td>{transfer.totalQuantity} ({transfer.itemCount} réf.)</td>
                  <td><span className={`badge ${statusBadge[transfer.status]}`}>{statusLabel[transfer.status]}</span></td>
                  <td>
                    {transfer.status !== 'completed' && (
                      <button className="btn-ghost" disabled={receivingId === transfer.id} onClick={() => handleReceive(transfer.id)}>
                        {receivingId === transfer.id ? 'Réception...' : 'Marquer reçu'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredTransfers.length === 0 && <p className="table-empty">Aucun transfert sur cette période.</p>}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau transfert" subtitle="Déplacez du stock d’un magasin vers un autre." wide>
        <NewTransferForm
          storeOptions={storeOptions}
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
