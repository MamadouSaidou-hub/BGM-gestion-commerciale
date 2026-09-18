'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Package, Percent, Plus, Search, Truck, Wallet, WalletCards } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { DiscountScaleModal } from '@/components/discount-scale-modal'
import { LoadError } from '@/components/load-error'
import { downloadCsv } from '@/lib/download-csv'
import { fetchJson } from '@/lib/fetch-json'

type Supplier = {
  id: number
  name: string
  phone: string
  owed: string
  totalPaid: string
  sacksThisMonth: number
  status: 'ok' | 'pending' | 'overdue'
}

type SuppliersData = {
  suppliers: Supplier[]
  summary: { totalSuppliers: number; totalOwed: string; deliveriesThisMonth: number }
}

type StoreOption = { id: number; name: string }
type ProductOption = { id: number; name: string; sku: string }

const statusLabel = { ok: 'À jour', pending: 'En cours', overdue: 'En retard' }
const statusBadge = { ok: 'badge-green', pending: 'badge-blue', overdue: 'badge-red' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Truck; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function NewSupplierForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/fournisseurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
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
      <div className="form-field"><label>Nom du fournisseur</label><input required value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className="form-field"><label>Téléphone</label><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="6XX XX XX XX" /></div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Création...' : 'Créer le fournisseur'}</button></div>
    </form>
  )
}

function RecordDeliveryForm({
  supplier,
  storeOptions,
  productOptions,
  onCreated,
}: {
  supplier: Supplier
  storeOptions: StoreOption[]
  productOptions: ProductOption[]
  onCreated: () => void
}) {
  const [storeId, setStoreId] = useState('')
  const [productId, setProductId] = useState('')
  const [sackCount, setSackCount] = useState('')
  const [tonnage, setTonnage] = useState('')
  const [reference, setReference] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'credit'>('credit')
  const [paidNow, setPaidNow] = useState('')
  const [dueInDays, setDueInDays] = useState('30')
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
      const res = await fetch(`/api/fournisseurs/${supplier.id}/livraisons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId,
          sackCount,
          tonnage: tonnage || null,
          reference: reference || undefined,
          paymentStatus,
          paidNow: paymentStatus === 'partial' ? paidNow : 0,
          dueInDays,
        }),
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
      <div className="form-row">
        <div className="form-field">
          <label>Magasin de réception</label>
          <select required value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            {storeOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Produit</label>
          <select required value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Sélectionner...</option>
            {productOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-field"><label>Nombre de sacs</label><input required type="number" min="1" value={sackCount} onChange={(event) => setSackCount(event.target.value)} /></div>
        <div className="form-field"><label>Tonnage (optionnel)</label><input type="number" min="0" step="0.01" value={tonnage} onChange={(event) => setTonnage(event.target.value)} placeholder="Pour info uniquement" /></div>
      </div>
      <div className="form-field"><label>Référence bon de livraison (optionnel)</label><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ex : plaque du camion" /></div>

      <div className="form-row">
        <div className="form-field">
          <label>Statut de paiement</label>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}>
            <option value="credit">À crédit</option>
            <option value="partial">Paiement partiel</option>
            <option value="paid">Payée comptant</option>
          </select>
        </div>
        {paymentStatus === 'partial' && (
          <div className="form-field"><label>Montant payé maintenant</label><input required type="number" min="0" value={paidNow} onChange={(event) => setPaidNow(event.target.value)} /></div>
        )}
        {paymentStatus !== 'paid' && (
          <div className="form-field"><label>Échéance (jours)</label><input required type="number" min="1" value={dueInDays} onChange={(event) => setDueInDays(event.target.value)} /></div>
        )}
      </div>

      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer la livraison'}</button></div>
    </form>
  )
}

function RecordSupplierPaymentForm({ supplier, onCreated }: { supplier: Supplier; onCreated: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'mobile_money' | 'bank_transfer' | 'check'>('bank_transfer')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/fournisseurs/${supplier.id}/paiements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method }),
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
      <p className="section-subtitle">Dû au fournisseur : <strong>{supplier.owed}</strong></p>
      <div className="form-row">
        <div className="form-field"><label>Montant payé (FCFA)</label><input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="form-field">
          <label>Méthode</label>
          <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="bank_transfer">Virement</option>
            <option value="check">Chèque</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="cash">Espèces</option>
          </select>
        </div>
      </div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer le paiement'}</button></div>
    </form>
  )
}

export function FournisseursView() {
  const [search, setSearch] = useState('')
  const [data, setData] = useState<SuppliersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])
  const [productOptions, setProductOptions] = useState<ProductOption[]>([])
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [deliverySupplier, setDeliverySupplier] = useState<Supplier | null>(null)
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null)
  const [discountSupplier, setDiscountSupplier] = useState<Supplier | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError('')
    fetchJson<SuppliersData>('/api/fournisseurs')
      .then((json) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue.'))
      .finally(() => setLoading(false))
    fetchJson<{ stores: StoreOption[] }>('/api/magasins').then((json) => setStoreOptions(json.stores)).catch(() => {})
    fetchJson<{ products: ProductOption[] }>('/api/products').then((json) => setProductOptions(json.products)).catch(() => {})
  }, [refreshKey])

  const filteredSuppliers = useMemo(() => {
    const rows = data?.suppliers ?? []
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => row.name.toLowerCase().includes(query) || row.phone.toLowerCase().includes(query))
  }, [data, search])

  return (
    <AppShell breadcrumb="Gestion" section="Fournisseurs" onExport={() => downloadCsv('/api/fournisseurs?format=csv', 'fournisseurs.csv')}>
      <section className="page-heading">
        <div><p className="eyebrow">APPROVISIONNEMENT</p><h1>Fournisseurs <span>et livraisons</span></h1><p className="heading-subtitle">Suivez les livraisons reçues et les sommes dues à vos fournisseurs.</p></div>
      </section>

      {error && <LoadError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}

      <section className="metrics-grid" aria-label="Indicateurs fournisseurs" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <MetricCard label="Fournisseurs" value={data ? `${data.summary.totalSuppliers}` : '—'} icon={Truck} tone="navy" />
        <MetricCard label="Dû aux fournisseurs" value={data ? data.summary.totalOwed : '—'} icon={Wallet} tone="orange" />
        <MetricCard label="Livraisons ce mois" value={data ? `${data.summary.deliveriesThisMonth}` : '—'} icon={Package} tone="blue" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-search">
          <Search aria-hidden="true" />
          <input placeholder="Rechercher un fournisseur..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un fournisseur" />
        </div>
        <button className="btn-primary" onClick={() => setSupplierModalOpen(true)}><Plus size={14} /> Nouveau fournisseur</button>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th>Téléphone</th>
                <th>Sacs ce mois</th>
                <th>Payé au total</th>
                <th>Dû</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td data-label="Fournisseur"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={13} color="var(--faint)" />{supplier.name}</span></td>
                  <td data-label="Téléphone">{supplier.phone}</td>
                  <td data-label="Sacs ce mois">{supplier.sacksThisMonth}</td>
                  <td data-label="Payé">{supplier.totalPaid}</td>
                  <td data-label="Dû">{supplier.owed}</td>
                  <td data-label="Statut"><span className={`badge ${statusBadge[supplier.status]}`}>{statusLabel[supplier.status]}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" onClick={() => setDeliverySupplier(supplier)}><Package size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Livraison</button>
                    {supplier.status !== 'ok' && (
                      <button className="btn-ghost" onClick={() => setPaymentSupplier(supplier)}><WalletCards size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Payer</button>
                    )}
                    <button className="btn-ghost" onClick={() => setDiscountSupplier(supplier)}><Percent size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Barème</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredSuppliers.length === 0 && <p className="table-empty">Aucun fournisseur trouvé.</p>}
        </div>
      </div>

      <Modal open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)} title="Nouveau fournisseur" subtitle="Ajoutez un fournisseur.">
        <NewSupplierForm onCreated={() => { setSupplierModalOpen(false); setRefreshKey((key) => key + 1) }} />
      </Modal>
      <Modal open={deliverySupplier !== null} onClose={() => setDeliverySupplier(null)} title={`Nouvelle livraison — ${deliverySupplier?.name ?? ''}`} subtitle="Enregistrez une réception de sacs et mettez à jour le stock." wide>
        {deliverySupplier && (
          <RecordDeliveryForm
            supplier={deliverySupplier}
            storeOptions={storeOptions}
            productOptions={productOptions}
            onCreated={() => { setDeliverySupplier(null); setRefreshKey((key) => key + 1) }}
          />
        )}
      </Modal>
      <Modal open={paymentSupplier !== null} onClose={() => setPaymentSupplier(null)} title={`Payer — ${paymentSupplier?.name ?? ''}`} subtitle="Enregistrez un paiement effectué à ce fournisseur.">
        {paymentSupplier && (
          <RecordSupplierPaymentForm
            supplier={paymentSupplier}
            onCreated={() => { setPaymentSupplier(null); setRefreshKey((key) => key + 1) }}
          />
        )}
      </Modal>
      {discountSupplier && (
        <DiscountScaleModal
          open={discountSupplier !== null}
          onClose={() => setDiscountSupplier(null)}
          partyType="supplier"
          partyId={discountSupplier.id}
          partyName={discountSupplier.name}
        />
      )}
    </AppShell>
  )
}
