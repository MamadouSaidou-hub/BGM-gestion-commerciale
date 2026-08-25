'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Package, Plus, ShoppingCart, Store, WalletCards } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'

type StoreRow = {
  id: number
  name: string
  city: string
  revenue: string
  salesCount: number
  totalStock: number
  lowStock: number
}

function NewStoreForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/magasins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, city }),
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
      <div className="form-field"><label>Nom du magasin</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex : BGM Deido" /></div>
      <div className="form-field"><label>Ville</label><input required value={city} onChange={(event) => setCity(event.target.value)} placeholder="Douala" /></div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Création...' : 'Créer le magasin'}</button></div>
    </form>
  )
}

export function StoresView() {
  const [stores, setStores] = useState<StoreRow[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetch('/api/magasins')
      .then((res) => res.json())
      .then((json: { stores: StoreRow[] }) => setStores(json.stores))
  }, [refreshKey])

  return (
    <AppShell breadcrumb="Gestion" section="Magasins">
      <section className="page-heading">
        <div><p className="eyebrow">RÉSEAU</p><h1>Magasins <span>BGM</span></h1><p className="heading-subtitle">Performance du mois en cours pour chaque point de vente.</p></div>
        <div className="filter-row">
          <button className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> Nouveau magasin</button>
        </div>
      </section>

      <div className="store-card-grid">
        {(stores ?? []).map((store) => (
          <article className="store-card" key={store.id}>
            <div className="store-card-head">
              <span className="store-card-icon"><Store aria-hidden="true" /></span>
              <div><strong>{store.name}</strong><span>{store.city}</span></div>
            </div>
            <div className="store-card-stats">
              <div><label><WalletCards size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />CA du mois</label><b>{store.revenue}</b></div>
              <div><label><ShoppingCart size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Ventes</label><b>{store.salesCount}</b></div>
              <div><label><Package size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Stock total</label><b>{store.totalStock}</b></div>
              <div><label><AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Alertes stock</label><b>{store.lowStock}</b></div>
            </div>
          </article>
        ))}
        {stores !== null && stores.length === 0 && <p className="table-empty">Aucun magasin enregistré.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau magasin" subtitle="Ajoutez un point de vente au réseau BGM.">
        <NewStoreForm onCreated={() => { setModalOpen(false); setRefreshKey((key) => key + 1) }} />
      </Modal>
    </AppShell>
  )
}
