'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/modal'

type Tier = { id?: number; thresholdSacks: string; discountPerSack: string }
type ScaleData = {
  tiers: { id: number; thresholdSacks: number; discountPerSack: number }[]
  current: { period: string; sackCount: number; tierReached: number | null; totalDiscountFormatted: string; nextTier: { thresholdSacks: number; sacksRemaining: number } | null }
  history: { period: string; sackCount: number; tierReached: number | null; totalDiscountFormatted: string }[]
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
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    fetch(`/api/remises/${partyType}/${partyId}`)
      .then((res) => res.json())
      .then((json: ScaleData) => {
        setData(json)
        setTiers(json.tiers.map((tier) => ({ id: tier.id, thresholdSacks: String(tier.thresholdSacks), discountPerSack: String(tier.discountPerSack) })))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) load()
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
    } finally {
      setSaving(false)
    }
  }

  async function handleCalculate() {
    setCalculating(true)
    try {
      await fetch(`/api/remises/${partyType}/${partyId}/calculer`, { method: 'POST' })
      load()
    } finally {
      setCalculating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Barème de remise — ${partyName}`} subtitle="Paliers de sacs mensuels et remise par sac." wide>
      {loading && <p className="heading-subtitle">Chargement...</p>}
      {!loading && data && (
        <>
          {error && <p className="form-error">{error}</p>}

          <p className="section-subtitle">
            Sacs ce mois : <strong>{data.current.sackCount}</strong>
            {' · '}Palier atteint : <strong>{data.current.tierReached ?? '—'}</strong>
            {' · '}Ristourne du mois : <strong>{data.current.totalDiscountFormatted}</strong>
            {data.current.nextTier && <> {' · '}Prochain palier dans <strong>{data.current.nextTier.sacksRemaining} sacs</strong></>}
          </p>

          <label style={{ fontSize: 10, fontWeight: 700, color: '#53647a', display: 'block', marginBottom: 6 }}>Paliers</label>
          {tiers.map((tier, index) => (
            <div className="item-row-grid" style={{ gridTemplateColumns: '1fr 1fr auto' }} key={index}>
              <div className="form-field" style={{ marginBottom: 0 }}><input required type="number" min="1" placeholder="Seuil (sacs)" value={tier.thresholdSacks} onChange={(event) => updateTier(index, { thresholdSacks: event.target.value })} /></div>
              <div className="form-field" style={{ marginBottom: 0 }}><input required type="number" min="0" placeholder="Remise/sac (FCFA)" value={tier.discountPerSack} onChange={(event) => updateTier(index, { discountPerSack: event.target.value })} /></div>
              <button type="button" className="item-row-remove" onClick={() => removeTier(index)} aria-label="Retirer le palier"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="item-add-link" onClick={addTier}><Plus size={13} /> Ajouter un palier</button>

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={handleCalculate} disabled={calculating}>{calculating ? 'Calcul...' : 'Calculer la ristourne du mois'}</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer le barème'}</button>
          </div>

          {data.history.length > 0 && (
            <>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#53647a', display: 'block', margin: '16px 0 6px' }}>Historique</label>
              <table className="data-table">
                <thead><tr><th>Période</th><th>Sacs</th><th>Palier</th><th>Ristourne</th></tr></thead>
                <tbody>
                  {data.history.map((row) => (
                    <tr key={row.period}>
                      <td>{row.period}</td>
                      <td>{row.sackCount}</td>
                      <td>{row.tierReached ?? '—'}</td>
                      <td>{row.totalDiscountFormatted}</td>
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
