'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ClipboardCheck, Layers, Package, PackagePlus, Plus, Search, Wallet } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { downloadCsv } from '@/lib/download-csv'
import { Modal } from '@/components/modal'

type StockItem = {
  name: string
  sku: string
  category: string
  store: string
  quantity: number
  threshold: number
  unitPrice: string
  status: 'critical' | 'low' | 'ok'
}

type StockData = {
  items: StockItem[]
  summary: { totalArticles: number; totalQuantity: number; lowCount: number; stockValue: string }
  stores: string[]
}

type StoreOption = { id: number; name: string }
type ProductOption = { id: number; name: string; sku: string }
type StockCountRow = { id: number; productName: string; sku: string; storeName: string; theoreticalQty: number; countedQty: number; variance: number; createdAt: string }

const statusLabel = { ok: 'OK', low: 'Faible', critical: 'Critique' }
const statusBadge = { ok: 'badge-green', low: 'badge-orange', critical: 'badge-red' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Package; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function NewProductForm({ storeOptions, onCreated }: { storeOptions: StoreOption[]; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [reorderThreshold, setReorderThreshold] = useState('10')
  const [storeId, setStoreId] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('0')
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
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sku, category, unitPrice, costPrice, reorderThreshold, storeId, initialQuantity }),
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
      <div className="form-field"><label>Nom de l’article</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex : Riz parfumé 25kg" /></div>
      <div className="form-row">
        <div className="form-field"><label>SKU</label><input required value={sku} onChange={(event) => setSku(event.target.value)} placeholder="RIZ-25" /></div>
        <div className="form-field"><label>Catégorie</label><input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Épicerie" /></div>
      </div>
      <div className="form-row">
        <div className="form-field"><label>Prix de vente (FCFA)</label><input required type="number" min="0" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></div>
        <div className="form-field"><label>Prix d’achat (FCFA)</label><input required type="number" min="0" value={costPrice} onChange={(event) => setCostPrice(event.target.value)} /></div>
      </div>
      <div className="form-row">
        <div className="form-field"><label>Seuil d’alerte</label><input required type="number" min="0" value={reorderThreshold} onChange={(event) => setReorderThreshold(event.target.value)} /></div>
        <div className="form-field"><label>Quantité initiale</label><input required type="number" min="0" value={initialQuantity} onChange={(event) => setInitialQuantity(event.target.value)} /></div>
      </div>
      <div className="form-field">
        <label>Magasin de départ</label>
        <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Création...' : 'Créer l’article'}</button></div>
    </form>
  )
}

function StockReceptionForm({ storeOptions, productOptions, onCreated }: { storeOptions: StoreOption[]; productOptions: ProductOption[]; onCreated: () => void }) {
  const [productId, setProductId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!productId && productOptions.length > 0) setProductId(String(productOptions[0].id))
  }, [productOptions, productId])
  useEffect(() => {
    if (!storeId && storeOptions.length > 0) setStoreId(String(storeOptions[0].id))
  }, [storeOptions, storeId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, storeId, quantity, reference }),
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
      <div className="form-field">
        <label>Article</label>
        <select required value={productId} onChange={(event) => setProductId(event.target.value)}>
          {productOptions.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.sku})</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Magasin</label>
          <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
        <div className="form-field"><label>Quantité reçue</label><input required type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
      </div>
      <div className="form-field"><label>Référence (optionnel)</label><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="BL fournisseur..." /></div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer la réception'}</button></div>
    </form>
  )
}

function StockCountForm({
  storeOptions,
  productOptions,
  stockItems,
  onCreated,
}: {
  storeOptions: StoreOption[]
  productOptions: ProductOption[]
  stockItems: StockItem[]
  onCreated: () => void
}) {
  const [productId, setProductId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [countedQty, setCountedQty] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!productId && productOptions.length > 0) setProductId(String(productOptions[0].id))
  }, [productOptions, productId])
  useEffect(() => {
    if (!storeId && storeOptions.length > 0) setStoreId(String(storeOptions[0].id))
  }, [storeOptions, storeId])

  const selectedProduct = productOptions.find((option) => String(option.id) === productId)
  const selectedStore = storeOptions.find((option) => String(option.id) === storeId)
  const theoreticalItem = stockItems.find((item) => item.sku === selectedProduct?.sku && item.store === selectedStore?.name)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/stock/count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, storeId, countedQty }),
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
      <div className="form-field">
        <label>Article</label>
        <select required value={productId} onChange={(event) => setProductId(event.target.value)}>
          {productOptions.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.sku})</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Magasin</label>
        <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      {theoreticalItem && <p className="section-subtitle">Quantité théorique actuelle : <strong>{theoreticalItem.quantity}</strong></p>}
      <div className="form-field"><label>Quantité comptée</label><input required type="number" min="0" value={countedQty} onChange={(event) => setCountedQty(event.target.value)} /></div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer le comptage'}</button></div>
    </form>
  )
}

export function StockView() {
  const [store, setStore] = useState('Tous les magasins')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<StockData | null>(null)
  const [loading, setLoading] = useState(true)
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [receptionModalOpen, setReceptionModalOpen] = useState(false)
  const [countModalOpen, setCountModalOpen] = useState(false)
  const [counts, setCounts] = useState<StockCountRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ store })
    fetch(`/api/stock?${params.toString()}`)
      .then((res) => res.json())
      .then((json: StockData) => {
        if (!cancelled) setData(json)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [store, refreshKey])

  useEffect(() => {
    fetch('/api/magasins')
      .then((res) => res.json())
      .then((json: { stores: StoreOption[] }) => setStoreOptions(json.stores))
    fetch('/api/products')
      .then((res) => res.json())
      .then((json: { products: ProductOption[] }) => setProductOptions(json.products))
  }, [refreshKey])

  useEffect(() => {
    const params = new URLSearchParams({ store })
    fetch(`/api/stock/count?${params.toString()}`)
      .then((res) => res.json())
      .then((json: { counts: StockCountRow[] }) => setCounts(json.counts ?? []))
  }, [store, refreshKey])

  const stores = data?.stores ?? ['Tous les magasins']
  const filteredItems = useMemo(() => {
    const items = data?.items ?? []
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) => item.name.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query) || item.category.toLowerCase().includes(query))
  }, [data, search])

  function refresh() {
    setProductModalOpen(false)
    setReceptionModalOpen(false)
    setCountModalOpen(false)
    setRefreshKey((key) => key + 1)
  }

  return (
    <AppShell breadcrumb="Gestion" section="Stock" onExport={() => downloadCsv(`/api/stock?${new URLSearchParams({ store, format: 'csv' }).toString()}`, 'stock.csv')}>
      <section className="page-heading">
        <div><p className="eyebrow">INVENTAIRE</p><h1>Stock <span>par magasin</span></h1><p className="heading-subtitle">Suivez les niveaux de stock et les articles à réapprovisionner.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Magasin</span><select value={store} onChange={(event) => setStore(event.target.value)}>{stores.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Indicateurs stock">
        <MetricCard label="Articles référencés" value={data ? `${data.summary.totalArticles}` : '—'} icon={Package} tone="navy" />
        <MetricCard label="Quantité totale" value={data ? `${data.summary.totalQuantity}` : '—'} icon={Layers} tone="blue" />
        <MetricCard label="Articles en alerte" value={data ? `${data.summary.lowCount}` : '—'} icon={AlertTriangle} tone="orange" />
        <MetricCard label="Valeur du stock" value={data ? data.summary.stockValue : '—'} icon={Wallet} tone="green" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-search">
          <Search aria-hidden="true" />
          <input placeholder="Rechercher un article, une référence..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un article" />
        </div>
        <button className="btn-secondary" onClick={() => setReceptionModalOpen(true)}><PackagePlus size={14} /> Réception stock</button>
        <button className="btn-secondary" onClick={() => setCountModalOpen(true)}><ClipboardCheck size={14} /> Comptage physique</button>
        <button className="btn-primary" onClick={() => setProductModalOpen(true)}><Plus size={14} /> Nouvel article</button>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>SKU</th>
                <th>Catégorie</th>
                <th>Magasin</th>
                <th>Quantité</th>
                <th>Seuil</th>
                <th>Prix unitaire</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={`${item.sku}-${item.store}`}>
                  <td data-label="Produit">{item.name}</td>
                  <td data-label="SKU">{item.sku}</td>
                  <td data-label="Catégorie">{item.category}</td>
                  <td data-label="Magasin">{item.store}</td>
                  <td data-label="Quantité">{item.quantity}</td>
                  <td data-label="Seuil">{item.threshold}</td>
                  <td data-label="Prix unitaire">{item.unitPrice}</td>
                  <td data-label="Statut"><span className={`badge ${statusBadge[item.status]}`}>{statusLabel[item.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredItems.length === 0 && <p className="table-empty">Aucun article ne correspond à votre recherche.</p>}
        </div>
      </div>

      {counts.length > 0 && (
        <div className="table-panel" style={{ marginTop: 20 }}>
          <div className="table-scroll">
            <p className="section-title" style={{ padding: '16px 18px 0' }}>Écarts récents</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th>Magasin</th>
                  <th>Théorique</th>
                  <th>Compté</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Date">{new Date(row.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td data-label="Produit">{row.productName} ({row.sku})</td>
                    <td data-label="Magasin">{row.storeName}</td>
                    <td data-label="Théorique">{row.theoreticalQty}</td>
                    <td data-label="Compté">{row.countedQty}</td>
                    <td data-label="Écart" style={{ color: row.variance === 0 ? undefined : row.variance > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{row.variance > 0 ? `+${row.variance}` : row.variance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={countModalOpen} onClose={() => setCountModalOpen(false)} title="Comptage physique" subtitle="Comparez le stock compté au stock théorique et ajustez le système.">
        <StockCountForm storeOptions={storeOptions} productOptions={productOptions} stockItems={data?.items ?? []} onCreated={refresh} />
      </Modal>

      <Modal open={productModalOpen} onClose={() => setProductModalOpen(false)} title="Nouvel article" subtitle="Ajoutez un article au catalogue et son stock de départ.">
        <NewProductForm storeOptions={storeOptions} onCreated={refresh} />
      </Modal>
      <Modal open={receptionModalOpen} onClose={() => setReceptionModalOpen(false)} title="Réception stock" subtitle="Enregistrez l’arrivée d’articles dans un magasin.">
        <StockReceptionForm storeOptions={storeOptions} productOptions={productOptions} onCreated={refresh} />
      </Modal>
    </AppShell>
  )
}
