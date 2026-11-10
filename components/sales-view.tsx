'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, CreditCard, Pencil, Plus, Receipt, Search, ShoppingCart, Trash2, WalletCards } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { LoadError } from '@/components/load-error'
import { SkeletonCards, SkeletonRows } from '@/components/skeleton'
import { downloadCsv } from '@/lib/download-csv'
import { fetchJson } from '@/lib/fetch-json'
import { businessConfig } from '@/lib/business-config'
import { authClient } from '@/lib/auth-client'

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
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'credit'>('paid')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobile_money' | 'bank_transfer' | 'check'>('cash')
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
      return Math.round(((Number(item.tonnage) || 0) * businessConfig.unit.bulkConversionFactor) / product.sackWeightKg)
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
    if (creatingClient && !newClientName.trim()) {
      setError('Le nom du nouveau client est requis.')
      return
    }
    if (!creatingClient && paymentStatus !== 'paid' && !clientId) {
      setError('Un client est requis pour une vente partielle ou à crédit.')
      return
    }
    setSubmitting(true)
    try {
      let effectiveClientId = clientId || null
      if (creatingClient) {
        const clientRes = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newClientName, phone: newClientPhone || undefined, storeId }),
        })
        const clientJson = await clientRes.json()
        if (!clientRes.ok) {
          setError(clientJson.error ?? 'Impossible de créer le client.')
          return
        }
        effectiveClientId = clientJson.client.id
      }

      const res = await fetch('/api/ventes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          clientId: effectiveClientId,
          paymentStatus,
          paidNow: paymentStatus === 'partial' ? paidNow : 0,
          method: paymentStatus !== 'credit' ? paymentMethod : undefined,
          dueInDays,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.unit === 'tonne' ? effectiveSacks(item) : item.quantity,
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
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Client {creatingClient ? '' : '(optionnel)'}</span>
            <button
              type="button"
              className="item-add-link"
              style={{ fontSize: 11 }}
              onClick={() => {
                setCreatingClient((value) => !value)
                setClientId('')
                setNewClientName('')
                setNewClientPhone('')
              }}
            >
              {creatingClient ? 'Choisir un client existant' : '+ Nouveau client'}
            </button>
          </label>
          {creatingClient ? (
            <div className="form-row" style={{ marginTop: 6 }}>
              <input required placeholder="Nom du client" value={newClientName} onChange={(event) => setNewClientName(event.target.value)} />
              <input placeholder="Téléphone (optionnel)" value={newClientPhone} onChange={(event) => setNewClientPhone(event.target.value)} />
            </div>
          ) : (
            <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Vente comptoir</option>
              {clientOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          )}
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
                  <input required type="number" min="1" placeholder={`Qté (${businessConfig.unit.basePluralLower})`} value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                </div>
              )}
              <div className="form-field" style={{ marginBottom: 0 }}><input readOnly disabled value={item.unitPrice ? `${Number(item.unitPrice).toLocaleString('fr-FR')} ${businessConfig.currency}` : 'Prix'} title="Prix catalogue — non modifiable" /></div>
              <button type="button" className="item-row-remove" onClick={() => removeItem(index)} disabled={items.length === 1} aria-label="Retirer la ligne"><Trash2 size={14} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                <input
                  type="radio"
                  name={`unit-${index}`}
                  checked={item.unit === 'sack'}
                  onChange={() => updateItem(index, { unit: 'sack', tonnage: '' })}
                /> {businessConfig.unit.baseSingular}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: canUseTonne ? 'var(--muted)' : 'var(--muted-light, #ccc)' }}>
                <input
                  type="radio"
                  name={`unit-${index}`}
                  disabled={!canUseTonne}
                  checked={item.unit === 'tonne'}
                  onChange={() => updateItem(index, { unit: 'tonne', quantity: '' })}
                /> {businessConfig.unit.bulkLabel}
              </label>
              {item.unit === 'tonne' && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>≈ {effectiveSacks(item)} {businessConfig.unit.baseSingularLower}(s)</span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" className="item-add-link" onClick={addItem}><Plus size={13} /> Ajouter un article</button>

      <div className="sale-total-row"><span>Total</span><span>{total.toLocaleString('fr-FR')} {businessConfig.currency}</span></div>

      <div className="form-row">
        <div className="form-field">
          <label>Statut de paiement</label>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}>
            <option value="paid">Payée comptant</option>
            <option value="partial">Paiement partiel</option>
            <option value="credit">À crédit</option>
          </select>
        </div>
        {paymentStatus !== 'credit' && (
          <div className="form-field">
            <label>Mode de paiement</label>
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>
              <option value="cash">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Virement</option>
              <option value="check">Chèque</option>
            </select>
          </div>
        )}
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

type SaleDetail = {
  reference: string
  storeId: number
  storeName: string
  clientId: number | null
  paymentStatus: 'paid' | 'partial' | 'credit'
  paidAmount: number
  totalAmount: number
  items: { productId: number; quantity: number; unit: 'sack' | 'tonne'; tonnage: number | null }[]
}

function EditSaleForm({
  sale,
  clientOptions,
  productOptions,
  onSaved,
}: {
  sale: SaleDetail
  clientOptions: ClientOption[]
  productOptions: ProductOption[]
  onSaved: () => void
}) {
  const [clientId, setClientId] = useState(sale.clientId ? String(sale.clientId) : '')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'credit'>(sale.paymentStatus)
  const [paidNow, setPaidNow] = useState(sale.paidAmount ? String(sale.paidAmount) : '')
  const [dueInDays, setDueInDays] = useState('15')
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<ItemRow[]>(
    sale.items.map((item) => ({
      productId: String(item.productId),
      quantity: item.unit === 'sack' ? String(item.quantity) : '',
      unitPrice: '',
      unit: item.unit,
      tonnage: item.tonnage ? String(item.tonnage) : '',
    })),
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const productMap = useMemo(() => new Map(productOptions.map((product) => [String(product.id), product])), [productOptions])

  useEffect(() => {
    // The catalog price at edit time may differ from what the sale originally charged — fill in
    // the current price just for display, the server always re-prices from the catalog anyway.
    setItems((rows) => rows.map((row) => {
      if (row.unitPrice) return row
      const product = productMap.get(row.productId)
      return product ? { ...row, unitPrice: String(product.unitPrice) } : row
    }))
  }, [productMap])

  function effectiveSacks(item: ItemRow) {
    if (item.unit === 'tonne') {
      const product = productMap.get(item.productId)
      if (!product?.sackWeightKg) return 0
      return Math.round(((Number(item.tonnage) || 0) * businessConfig.unit.bulkConversionFactor) / product.sackWeightKg)
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
      const res = await fetch(`/api/ventes/${sale.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId || null,
          paymentStatus,
          paidNow: paymentStatus === 'partial' ? paidNow : 0,
          dueInDays,
          reason: reason || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.unit === 'tonne' ? effectiveSacks(item) : item.quantity,
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
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <div className="form-row">
        <div className="form-field"><label>Magasin</label><input readOnly disabled value={sale.storeName} title="Le magasin ne peut pas être modifié — annulez et recréez la vente pour la déplacer vers un autre magasin." /></div>
        <div className="form-field">
          <label>Client</label>
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
                  <input required type="number" min="1" placeholder={`Qté (${businessConfig.unit.basePluralLower})`} value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                </div>
              )}
              <div className="form-field" style={{ marginBottom: 0 }}><input readOnly disabled value={item.unitPrice ? `${Number(item.unitPrice).toLocaleString('fr-FR')} ${businessConfig.currency}` : 'Prix'} title="Prix catalogue — non modifiable" /></div>
              <button type="button" className="item-row-remove" onClick={() => removeItem(index)} disabled={items.length === 1} aria-label="Retirer la ligne"><Trash2 size={14} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                <input type="radio" name={`edit-unit-${index}`} checked={item.unit === 'sack'} onChange={() => updateItem(index, { unit: 'sack', tonnage: '' })} /> {businessConfig.unit.baseSingular}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: canUseTonne ? 'var(--muted)' : 'var(--muted-light, #ccc)' }}>
                <input type="radio" name={`edit-unit-${index}`} disabled={!canUseTonne} checked={item.unit === 'tonne'} onChange={() => updateItem(index, { unit: 'tonne', quantity: '' })} /> {businessConfig.unit.bulkLabel}
              </label>
              {item.unit === 'tonne' && <span style={{ fontSize: 12, color: 'var(--muted)' }}>≈ {effectiveSacks(item)} {businessConfig.unit.baseSingularLower}(s)</span>}
            </div>
          </div>
        )
      })}
      <button type="button" className="item-add-link" onClick={addItem}><Plus size={13} /> Ajouter un article</button>

      <div className="sale-total-row"><span>Nouveau total</span><span>{total.toLocaleString('fr-FR')} {businessConfig.currency}</span></div>

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

      <div className="form-field">
        <label>Motif de la correction (optionnel)</label>
        <input placeholder="Ex. erreur de quantité saisie par le vendeur" value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>

      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer la correction'}</button></div>
    </form>
  )
}

export function SalesView() {
  const { data: session } = authClient.useSession()
  const isAdmin = session?.user?.role === 'admin'
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
  const [cancellingSale, setCancellingSale] = useState<Sale | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [editingSale, setEditingSale] = useState<SaleDetail | null>(null)
  const [editLoadError, setEditLoadError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  async function handleEditSale(reference: string) {
    setEditLoadError('')
    try {
      const res = await fetch(`/api/ventes/${reference}`)
      const json = await res.json()
      if (!res.ok) {
        setEditLoadError(json.error ?? 'Impossible de charger la vente.')
        return
      }
      setEditingSale(json.sale)
    } catch {
      setEditLoadError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    }
  }

  async function handleCancelSale() {
    if (!cancellingSale) return
    setCancelling(true)
    setCancelError('')
    try {
      const res = await fetch(`/api/ventes/${cancellingSale.reference}/annuler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCancelError(json.error ?? 'Une erreur est survenue.')
        return
      }
      setCancellingSale(null)
      setCancelReason('')
      setRefreshKey((key) => key + 1)
    } catch {
      setCancelError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setCancelling(false)
    }
  }

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
      {editLoadError && <LoadError message={editLoadError} onRetry={() => setEditLoadError('')} />}

      <section className="metrics-grid" aria-label="Indicateurs ventes">
        {loading ? <SkeletonCards count={4} /> : (
          <>
            <MetricCard label="Nombre de ventes" value={`${data?.summary.count ?? 0}`} icon={ShoppingCart} tone="navy" />
            <MetricCard label="Chiffre d’affaires" value={data?.summary.totalRevenue ?? '—'} icon={WalletCards} tone="green" />
            <MetricCard label="Panier moyen" value={data?.summary.avgBasket ?? '—'} icon={Receipt} tone="blue" />
            <MetricCard label="Ventes à crédit" value={`${data?.summary.creditCount ?? 0}`} icon={CreditCard} tone="orange" />
          </>
        )}
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
              {loading && <SkeletonRows count={6} />}
              {!loading && filteredSales.map((sale) => (
                <tr key={sale.reference}>
                  <td data-label="Référence">#{sale.reference}</td>
                  <td data-label="Date">{new Date(sale.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td data-label="Magasin">{sale.store}</td>
                  <td data-label="Client">{sale.client}</td>
                  <td data-label="Montant">{sale.amount}</td>
                  <td data-label="Statut"><span className={`badge ${statusBadge[sale.status]}`}>{statusLabel[sale.status]}</span></td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <a className="btn-ghost" href={`/ventes/${sale.reference}/facture`} target="_blank" rel="noopener noreferrer"><Receipt size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Facture</a>
                    {isAdmin && (
                      <>
                        <button type="button" className="btn-ghost" onClick={() => handleEditSale(sale.reference)}>
                          <Pencil size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Modifier
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => { setCancelError(''); setCancelReason(''); setCancellingSale(sale) }}>
                          <Trash2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Annuler
                        </button>
                      </>
                    )}
                  </td>
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

      <Modal open={cancellingSale !== null} onClose={() => setCancellingSale(null)} title="Annuler cette vente ?" subtitle={cancellingSale ? `Vente #${cancellingSale.reference} — ${cancellingSale.amount}` : ''}>
        {cancelError && <p className="form-error">{cancelError}</p>}
        <p className="section-subtitle">
          Le stock vendu sera restauré. La vente reste visible dans l’historique (marquée annulée, avec qui et quand) — elle disparaît des listes et des totaux.
        </p>
        <div className="form-field">
          <label>Motif (optionnel)</label>
          <input placeholder="Ex. vente enregistrée par erreur" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => setCancellingSale(null)} disabled={cancelling}>Garder la vente</button>
          <button type="button" className="btn-primary" onClick={handleCancelSale} disabled={cancelling}>{cancelling ? 'Annulation...' : 'Annuler la vente'}</button>
        </div>
      </Modal>

      <Modal open={editingSale !== null} onClose={() => setEditingSale(null)} title="Modifier la vente" subtitle={editingSale ? `Vente #${editingSale.reference}` : ''} wide>
        {editingSale && (
          <EditSaleForm
            sale={editingSale}
            clientOptions={clientOptions}
            productOptions={productOptions}
            onSaved={() => {
              setEditingSale(null)
              setRefreshKey((key) => key + 1)
            }}
          />
        )}
      </Modal>
    </AppShell>
  )
}
