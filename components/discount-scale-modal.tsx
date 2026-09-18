'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/modal'
import { LoadError } from '@/components/load-error'
import { fetchJson } from '@/lib/fetch-json'

type Tier = { id?: number; thresholdSacks: string; discountPerSack: string }
type ScaleData = {
  tiers: { id: number; thresholdSacks: number; discountPerSack: number }[]
  current: { period: string | null; sackCount: number; tierReached: number | null; totalDiscountFormatted: string; nextTier: { thresholdSacks: number; sacksRemaining: number } | null }
  history: { period: string; sackCount: number; tierReached: number | null; totalDiscountFormatted: string }[]
}

function formatPeriod(period: string) {
  // Client history: "2026-09" (a month). Supplier history: an ISO timestamp (a cycle's grant date).
  if (/^\d{4}-\d{2}$/.test(period)) return period
  return new Date(period).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DiscountScaleModal({
  open,
  onClose,
  partyType,
  partyId,
  partyName,
}: {
  open: boolean
  onClose: () => void
  partyType: 'client' | 'supplier'
  partyId: number
  partyName: string
}) {
  const [data, setData] = useState<ScaleData | null>(null)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [calculateMessage, setCalculateMessage] = useState('')
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    setError('')
    fetchJson<ScaleData>(`/api/remises/${partyType}/${partyId}`)
      .then((json) => {
        setData(json)
        setTiers(json.tiers.map((tier) => ({ id: tier.id, thresholdSacks: String(tier.thresholdSacks), discountPerSack: String(tier.discountPerSack) })))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur inconnue.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) {
      setCalculateMessage('')
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partyType, partyId])

  function updateTier(index: number, patch: Partial<Tier>) {
    setTiers((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addTier() {
    setTiers((rows) => [...rows, { thresholdSacks: '', discountPerSack: '' }])
  }

  function removeTier(index: number) {
    setTiers((rows) => rows.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/remises/${partyType}/${partyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers: tiers.map((tier) => ({ thresholdSacks: tier.thresholdSacks, discountPerSack: tier.discountPerSack })) }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      load()
    } catch {
      setError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCalculate() {
    setCalculating(true)
    setCalculateMessage('')
    setError('')
    try {
      const res = await fetch(`/api/remises/${partyType}/${partyId}/calculer`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Une erreur est survenue.')
        return
      }
      if (partyType === 'supplier' && !json.result) {
        setCalculateMessage('Palier pas encore atteint — rien à accorder pour l’instant.')
      }
      load()
    } catch {
      setError('Connexion instable — impossible de contacter le serveur. Réessayez.')
    } finally {
      setCalculating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Barème de remise — ${partyName}`}
      subtitle={partyType === 'supplier' ? 'Palier de sacs répété (sans limite de temps) et remise par sac.' : 'Paliers de sacs mensuels et remise par sac.'}
      wide
    >
      {loading && <p className="heading-subtitle">Chargement...</p>}
      {!loading && !data && error && <LoadError message={error} onRetry={load} />}
      {!loading && data && (
        <>
          {error && <p className="form-error">{error}</p>}
          {calculateMessage && <p className="section-subtitle">{calculateMessage}</p>}

          {partyType === 'client' ? (
            <p className="section-subtitle">
              Sacs ce mois : <strong>{data.current.sackCount}</strong>
              {' · '}Palier atteint : <strong>{data.current.tierReached ?? '—'}</strong>
              {' · '}Ristourne du mois : <strong>{data.current.totalDiscountFormatted}</strong>
              {data.current.nextTier && <> {' · '}Prochain palier dans <strong>{data.current.nextTier.sacksRemaining} sacs</strong></>}
            </p>
          ) : (
            <p className="section-subtitle">
              Sacs depuis le dernier palier : <strong>{data.current.sackCount}</strong>
              {data.current.nextTier && <> {' · '}Prochain palier dans <strong>{data.current.nextTier.sacksRemaining} sacs</strong></>}
            </p>
          )}

          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Paliers</label>
          {tiers.map((tier, index) => (
            <div className="item-row-grid" style={{ gridTemplateColumns: '1fr 1fr auto' }} key={index}>
              <div className="form-field" style={{ marginBottom: 0 }}><input required type="number" min="1" placeholder="Seuil (sacs)" value={tier.thresholdSacks} onChange={(event) => updateTier(index, { thresholdSacks: event.target.value })} /></div>
              <div className="form-field" style={{ marginBottom: 0 }}><input required type="number" min="0" placeholder="Remise/sac (FCFA)" value={tier.discountPerSack} onChange={(event) => updateTier(index, { discountPerSack: event.target.value })} /></div>
              <button type="button" className="item-row-remove" onClick={() => removeTier(index)} aria-label="Retirer le palier"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="item-add-link" onClick={addTier}><Plus size={13} /> Ajouter un palier</button>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={handleCalculate} disabled={calculating}>
              {calculating ? 'Calcul...' : partyType === 'client' ? 'Calculer la ristourne du mois' : 'Vérifier le palier'}
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer le barème'}</button>
          </div>

          {data.history.length > 0 && (
            <>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', display: 'block', margin: '16px 0 6px' }}>Historique</label>
              <table className="data-table">
                <thead><tr><th>{partyType === 'client' ? 'Période' : 'Date du palier'}</th><th>Sacs</th><th>Palier</th><th>Ristourne</th></tr></thead>
                <tbody>
                  {data.history.map((row) => (
                    <tr key={row.period}>
                      <td data-label="Période">{formatPeriod(row.period)}</td>
                      <td data-label="Sacs">{row.sackCount}</td>
                      <td data-label="Palier">{row.tierReached ?? '—'}</td>
                      <td data-label="Ristourne">{row.totalDiscountFormatted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
