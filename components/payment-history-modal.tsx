'use client'

import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Modal } from '@/components/modal'
import { LoadError } from '@/components/load-error'
import { fetchJson } from '@/lib/fetch-json'

type PaymentRow = { id: number; amount: number; amountFormatted: string; method: 'cash' | 'mobile_money' | 'bank_transfer' | 'check'; date: string; linkedSaleReference: string | null }

const methodLabel = { cash: 'Espèces', mobile_money: 'Mobile Money', bank_transfer: 'Virement', check: 'Chèque' }

function EditPaymentRow({ payment, onSaved, onCancel }: { payment: PaymentRow; onSaved: () => void; onCancel: () => void }) {
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
      const res = await fetch(`/api/tresorerie/${payment.id}`, {
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
            <option value="cash">Espèces</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="bank_transfer">Virement</option>
            <option value="check">Chèque</option>
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

export function PaymentHistoryModal({ open, onClose, clientId, clientName }: { open: boolean; onClose: () => void; clientId: number; clientName: string }) {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingPayment, setDeletingPayment] = useState<PaymentRow | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    fetchJson<{ payments: PaymentRow[] }>(`/api/clients/${clientId}/paiements`)
      .then((json) => setPayments(json.payments))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) {
      setEditingId(null)
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId])

  async function handleDelete() {
    if (!deletingPayment) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await fetch(`/api/tresorerie/${deletingPayment.id}`, {
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
    <Modal open={open} onClose={onClose} title={`Historique des paiements — ${clientName}`} subtitle="Corrigez ou supprimez un paiement enregistré par erreur." wide>
      {loading && <p className="heading-subtitle">Chargement...</p>}
      {!loading && error && <LoadError message={error} onRetry={load} />}
      {!loading && !error && (
        <>
          {payments.length === 0 && <p className="table-empty">Aucun paiement enregistré pour ce client.</p>}
          {payments.map((payment) => (
            <div key={payment.id} style={{ borderBottom: '1px solid var(--divider)' }}>
              {editingId === payment.id ? (
                <EditPaymentRow payment={payment} onSaved={() => { setEditingId(null); load() }} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="payment-status-row">
                  <div className="payment-status-copy">
                    <strong>{payment.amountFormatted}</strong>
                    <span>{new Date(payment.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {methodLabel[payment.method]}</span>
                  </div>
                  {payment.linkedSaleReference ? (
                    <span className="badge badge-muted" title="Ce paiement a été créé avec une vente — modifiez la vente directement.">Vente #{payment.linkedSaleReference}</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn-ghost" onClick={() => setEditingId(payment.id)}><Pencil size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Modifier</button>
                      <button type="button" className="btn-ghost" onClick={() => { setDeleteError(''); setDeleteReason(''); setDeletingPayment(payment) }}><Trash2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Supprimer</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <Modal
        open={deletingPayment !== null}
        onClose={() => setDeletingPayment(null)}
        title="Supprimer ce paiement ?"
        subtitle={deletingPayment ? deletingPayment.amountFormatted : ''}
      >
        {deleteError && <p className="form-error">{deleteError}</p>}
        <p className="section-subtitle">
          L’écriture de caisse correspondante sera annulée. La créance de ce client n’est pas rouverte automatiquement —
          vérifiez-la manuellement si besoin.
        </p>
        <div className="form-field">
          <label>Motif (optionnel)</label>
          <input placeholder="Ex. paiement saisi deux fois" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => setDeletingPayment(null)} disabled={deleting}>Garder</button>
          <button type="button" className="btn-primary" onClick={handleDelete} disabled={deleting}>{deleting ? 'Suppression...' : 'Supprimer'}</button>
        </div>
      </Modal>
    </Modal>
  )
}
