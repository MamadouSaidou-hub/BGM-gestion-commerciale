'use client'

import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Modal } from '@/components/modal'
import { LoadError } from '@/components/load-error'
import { fetchJson } from '@/lib/fetch-json'
import { businessConfig } from '@/lib/business-config'

type DeliveryRow = {
  id: number
  store: string
  product: string
  sackCount: number
  tonnage: number | null
  totalAmountFormatted: string
  reference: string | null
  date: string
}
type PaymentRow = { id: number; amount: number; amountFormatted: string; method: 'cash' | 'mobile_money' | 'bank_transfer' | 'check'; date: string }

const methodLabel = { cash: 'Espèces', mobile_money: 'Mobile Money', bank_transfer: 'Virement', check: 'Chèque' }

function EditDeliveryRow({ supplierId, delivery, onSaved, onCancel }: { supplierId: number; delivery: DeliveryRow; onSaved: () => void; onCancel: () => void }) {
  const [sackCount, setSackCount] = useState(String(delivery.sackCount))
  const [tonnage, setTonnage] = useState(delivery.tonnage ? String(delivery.tonnage) : '')
  const [reference, setReference] = useState(delivery.reference ?? '')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'credit'>('paid')
  const [paidNow, setPaidNow] = useState('')
  const [dueInDays, setDueInDays] = useState('30')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/fournisseurs/${supplierId}/livraisons/${delivery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sackCount,
          tonnage: tonnage || null,
          reference: reference || undefined,
          paymentStatus,
          paidNow: paymentStatus === 'partial' ? paidNow : 0,
          dueInDays,
          reason: reason || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      onSaved()
    } catch {
      setError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '10px 0' }}>
      {error && <p className="form-error">{error}</p>}
      <div className="form-row">
        <div className="form-field"><label>Nombre de {businessConfig.unit.basePluralLower}</label><input required type="number" min="1" value={sackCount} onChange={(event) => setSackCount(event.target.value)} /></div>
        <div className="form-field"><label>Tonnage (optionnel)</label><input type="number" min="0" step="0.01" value={tonnage} onChange={(event) => setTonnage(event.target.value)} /></div>
      </div>
      <div className="form-field"><label>Référence (optionnel)</label><input value={reference} onChange={(event) => setReference(event.target.value)} /></div>
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
          <div className="form-field"><label>Montant payé maintenant</label><input required type="number" min="0" value={paidNow} onChange={(event) => setPaidNow(event.target.value)} /></div>
        )}
        {paymentStatus !== 'paid' && (
          <div className="form-field"><label>Échéance (jours)</label><input required type="number" min="1" value={dueInDays} onChange={(event) => setDueInDays(event.target.value)} /></div>
        )}
      </div>
      <div className="form-field"><label>Motif de la correction (optionnel)</label><input value={reason} onChange={(event) => setReason(event.target.value)} /></div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>Annuler</button>
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

function EditSupplierPaymentRow({ supplierId, payment, onSaved, onCancel }: { supplierId: number; payment: PaymentRow; onSaved: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(String(payment.amount))
  const [method, setMethod] = useState(payment.method)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/fournisseurs/${supplierId}/paiements/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method, reason: reason || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      onSaved()
    } catch {
      setError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '10px 0' }}>
      {error && <p className="form-error">{error}</p>}
      <div className="form-row">
        <div className="form-field"><label>Montant (GNF)</label><input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
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
      <div className="form-field"><label>Motif de la correction (optionnel)</label><input value={reason} onChange={(event) => setReason(event.target.value)} /></div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>Annuler</button>
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

export function SupplierHistoryModal({ open, onClose, supplierId, supplierName }: { open: boolean; onClose: () => void; supplierId: number; supplierName: string }) {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingDeliveryId, setEditingDeliveryId] = useState<number | null>(null)
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null)
  const [deletingDelivery, setDeletingDelivery] = useState<DeliveryRow | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<PaymentRow | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      fetchJson<{ deliveries: DeliveryRow[] }>(`/api/fournisseurs/${supplierId}/livraisons`),
      fetchJson<{ payments: PaymentRow[] }>(`/api/fournisseurs/${supplierId}/paiements`),
    ])
      .then(([deliveriesJson, paymentsJson]) => {
        setDeliveries(deliveriesJson.deliveries)
        setPayments(paymentsJson.payments)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) {
      setEditingDeliveryId(null)
      setEditingPaymentId(null)
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplierId])

  async function handleDeleteDelivery() {
    if (!deletingDelivery) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/fournisseurs/${supplierId}/livraisons/${deletingDelivery.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        setDeleteError(json.error ?? 'Une erreur est survenue.')
        return
      }
      setDeletingDelivery(null)
      setDeleteReason('')
      load()
    } catch {
      setDeleteError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeletePayment() {
    if (!deletingPayment) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/fournisseurs/${supplierId}/paiements/${deletingPayment.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        setDeleteError(json.error ?? 'Une erreur est survenue.')
        return
      }
      setDeletingPayment(null)
      setDeleteReason('')
      load()
    } catch {
      setDeleteError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Historique — ${supplierName}`} subtitle="Corrigez ou supprimez une livraison ou un paiement enregistré par erreur." wide>
      {loading && <p className="heading-subtitle">Chargement...</p>}
      {!loading && error && <LoadError message={error} onRetry={load} />}
      {!loading && !error && (
        <>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Livraisons</label>
          {deliveries.length === 0 && <p className="table-empty">Aucune livraison enregistrée.</p>}
          {deliveries.map((delivery) => (
            <div key={delivery.id} style={{ borderBottom: '1px solid var(--divider)' }}>
              {editingDeliveryId === delivery.id ? (
                <EditDeliveryRow supplierId={supplierId} delivery={delivery} onSaved={() => { setEditingDeliveryId(null); load() }} onCancel={() => setEditingDeliveryId(null)} />
              ) : (
                <div className="payment-status-row">
                  <div className="payment-status-copy">
                    <strong>{delivery.product} — {delivery.sackCount} {businessConfig.unit.basePluralLower}(s)</strong>
                    <span>{new Date(delivery.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {delivery.store}{delivery.reference ? ` · ${delivery.reference}` : ''}</span>
                  </div>
                  <b>{delivery.totalAmountFormatted}</b>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn-ghost" onClick={() => setEditingDeliveryId(delivery.id)}><Pencil size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Modifier</button>
                    <button type="button" className="btn-ghost" onClick={() => { setDeleteError(''); setDeleteReason(''); setDeletingDelivery(delivery) }}><Trash2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Supprimer</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', display: 'block', margin: '16px 0 6px' }}>Paiements</label>
          {payments.length === 0 && <p className="table-empty">Aucun paiement enregistré.</p>}
          {payments.map((payment) => (
            <div key={payment.id} style={{ borderBottom: '1px solid var(--divider)' }}>
              {editingPaymentId === payment.id ? (
                <EditSupplierPaymentRow supplierId={supplierId} payment={payment} onSaved={() => { setEditingPaymentId(null); load() }} onCancel={() => setEditingPaymentId(null)} />
              ) : (
                <div className="payment-status-row">
                  <div className="payment-status-copy">
                    <strong>{payment.amountFormatted}</strong>
                    <span>{new Date(payment.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {methodLabel[payment.method]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn-ghost" onClick={() => setEditingPaymentId(payment.id)}><Pencil size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Modifier</button>
                    <button type="button" className="btn-ghost" onClick={() => { setDeleteError(''); setDeleteReason(''); setDeletingPayment(payment) }}><Trash2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Supprimer</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <Modal open={deletingDelivery !== null} onClose={() => setDeletingDelivery(null)} title="Supprimer cette livraison ?" subtitle={deletingDelivery ? `${deletingDelivery.product} — ${deletingDelivery.sackCount} ${businessConfig.unit.basePluralLower}(s)` : ''}>
        {deleteError && <p className="form-error">{deleteError}</p>}
        <p className="section-subtitle">
          Le stock reçu sera retiré (impossible si une partie a déjà été vendue ou transférée). Si cette livraison a
          contribué à un palier de remise déjà accordé, ce palier reste acquis — il n’est pas retiré automatiquement.
        </p>
        <div className="form-field">
          <label>Motif (optionnel)</label>
          <input placeholder="Ex. livraison saisie deux fois" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => setDeletingDelivery(null)} disabled={deleting}>Garder</button>
          <button type="button" className="btn-primary" onClick={handleDeleteDelivery} disabled={deleting}>{deleting ? 'Suppression...' : 'Supprimer'}</button>
        </div>
      </Modal>

      <Modal open={deletingPayment !== null} onClose={() => setDeletingPayment(null)} title="Supprimer ce paiement ?" subtitle={deletingPayment ? deletingPayment.amountFormatted : ''}>
        {deleteError && <p className="form-error">{deleteError}</p>}
        <p className="section-subtitle">
          L’écriture de caisse correspondante sera annulée. La dette de ce fournisseur n’est pas rouverte
          automatiquement — vérifiez-la manuellement si besoin.
        </p>
        <div className="form-field">
          <label>Motif (optionnel)</label>
          <input placeholder="Ex. paiement saisi deux fois" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => setDeletingPayment(null)} disabled={deleting}>Garder</button>
          <button type="button" className="btn-primary" onClick={handleDeletePayment} disabled={deleting}>{deleting ? 'Suppression...' : 'Supprimer'}</button>
        </div>
      </Modal>
    </Modal>
  )
}
