'use client'

import { useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Banknote, ChevronDown, Landmark, Plus, Smartphone, Star, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Modal } from '@/components/modal'
import { LoadError } from '@/components/load-error'
import { fetchJson } from '@/lib/fetch-json'
import { downloadCsv } from '@/lib/download-csv'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'

const periods = ['Aujourd’hui', '7 derniers jours', 'Ce mois-ci']

type CashAccountType = 'cash' | 'bank' | 'mobile_money' | 'other'
type CashAccount = { id: number; name: string; type: CashAccountType; balance: number; balanceFormatted: string; isDefault: boolean }
type Movement = { id: number; date: string; account: string; type: 'expense' | 'deposit'; category: string; description: string | null; amountFormatted: string }
type ExpenseBreakdownRow = { category: string; amount: number; amountFormatted: string; pct: number }
type CaisseData = {
  accounts: CashAccount[]
  movements: Movement[]
  summary: { totalBalance: string; totalExpenses: string; totalDeposits: string; accountCount: number }
  expenseBreakdown: ExpenseBreakdownRow[]
}

const typeLabel: Record<CashAccountType, string> = { cash: 'Espèces', bank: 'Banque', mobile_money: 'Mobile Money', other: 'Autre' }
const typeIcon: Record<CashAccountType, typeof Wallet> = { cash: Wallet, bank: Landmark, mobile_money: Smartphone, other: Banknote }
const movementTypeLabel = { expense: 'Dépense', deposit: 'Dépôt' }

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Wallet; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

const breakdownColors = ['var(--primary)', 'var(--orange)', 'var(--blue)', 'var(--green)', '#a68af0', 'var(--red)']

function ExpenseBreakdownBar({ row, max, color }: { row: ExpenseBreakdownRow; max: number; color: string }) {
  const pct = max > 0 ? Math.max((row.amount / max) * 100, 2) : 0
  return (
    <div className="rank-bar-row">
      <span className="rank-bar-label" title={row.category}>{row.category}</span>
      <div className="rank-bar-track"><div className="rank-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="rank-bar-value">
        {row.amountFormatted}
        <span style={{ display: 'block', fontSize: 10, color: 'var(--faint)', fontWeight: 400 }}>{row.pct.toFixed(1).replace('.', ',')} %</span>
      </span>
    </div>
  )
}

function NewAccountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<CashAccountType>('cash')
  const [initialBalance, setInitialBalance] = useState('0')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/caisses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, initialBalance }),
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
      <div className="form-field"><label>Nom de la caisse</label><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex : Caisse principale" /></div>
      <div className="form-row">
        <div className="form-field">
          <label>Type</label>
          <select value={type} onChange={(event) => setType(event.target.value as CashAccountType)}>
            <option value="cash">Espèces</option>
            <option value="bank">Banque</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div className="form-field"><label>Solde initial (GNF)</label><input required type="number" min="0" value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} /></div>
      </div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Création...' : 'Créer la caisse'}</button></div>
    </form>
  )
}

function NewMovementForm({ type, accounts, onCreated }: { type: 'expense' | 'deposit'; accounts: CashAccount[]; onCreated: () => void }) {
  const [cashAccountId, setCashAccountId] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!cashAccountId && accounts.length > 0) setCashAccountId(String(accounts[0].id))
  }, [accounts, cashAccountId])

  useEffect(() => {
    if (type === 'expense' && !category) setCategory(EXPENSE_CATEGORIES[0])
    if (type === 'deposit' && EXPENSE_CATEGORIES.includes(category as (typeof EXPENSE_CATEGORIES)[number])) setCategory('')
  }, [type, category])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/caisses/mouvements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashAccountId, type, category, description, amount }),
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
      <div className="form-field">
        <label>Caisse</label>
        <select required value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)}>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-field"><label>Montant (GNF)</label><input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="form-field">
          <label>Motif</label>
          {type === 'expense' ? (
            <select required value={category} onChange={(event) => setCategory(event.target.value)}>
              {EXPENSE_CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex : Vente comptant, Apport..." />
          )}
        </div>
      </div>
      <div className="form-field"><label>Description (optionnel)</label><input value={description} onChange={(event) => setDescription(event.target.value)} /></div>
      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Enregistrement...' : type === 'expense' ? 'Enregistrer la dépense' : 'Enregistrer le dépôt'}
        </button>
      </div>
    </form>
  )
}

function TransferForm({ accounts, onCreated }: { accounts: CashAccount[]; onCreated: () => void }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!fromId && accounts.length > 0) setFromId(String(accounts.find((a) => a.isDefault)?.id ?? accounts[0].id))
  }, [accounts, fromId])
  useEffect(() => {
    if (!toId && accounts.length > 1) {
      const other = accounts.find((account) => String(account.id) !== fromId)
      if (other) setToId(String(other.id))
    }
  }, [accounts, fromId, toId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (fromId === toId) {
      setError('Choisissez deux caisses différentes.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/caisses/transfert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId, toId, amount, description: description || undefined }),
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
          <label>De</label>
          <select required value={fromId} onChange={(event) => setFromId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.isDefault ? ' (principale)' : ''}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Vers</label>
          <select required value={toId} onChange={(event) => setToId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.isDefault ? ' (principale)' : ''}</option>)}
          </select>
        </div>
      </div>
      <div className="form-field"><label>Montant (GNF)</label><input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
      <div className="form-field"><label>Description (optionnel)</label><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex : Dépôt bancaire hebdomadaire" /></div>
      <div className="form-actions"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Transfert...' : 'Transférer'}</button></div>
    </form>
  )
}

export function CaisseView() {
  const [period, setPeriod] = useState(periods[1])
  const [data, setData] = useState<CaisseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  async function makeDefault(id: number) {
    await fetch(`/api/caisses/${id}/defaut`, { method: 'POST' })
    setRefreshKey((key) => key + 1)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchJson<CaisseData>(`/api/caisses?${new URLSearchParams({ period }).toString()}`)
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
  }, [period, refreshKey])

  const accounts = data?.accounts ?? []

  return (
    <AppShell breadcrumb="Pilotage" section="Caisse & Dépenses" onExport={() => downloadCsv(`/api/caisses?${new URLSearchParams({ period, format: 'csv' }).toString()}`, 'caisse-mouvements.csv')}>
      <section className="page-heading">
        <div><p className="eyebrow">FINANCES</p><h1>Caisse <span>et dépenses</span></h1><p className="heading-subtitle">Suivez vos comptes (espèces, banque, Mobile Money) et vos dépenses.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Période</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
        </div>
      </section>

      {error && <LoadError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}

      <section className="metrics-grid" aria-label="Indicateurs caisse">
        <MetricCard label="Solde total" value={data ? data.summary.totalBalance : '—'} icon={Wallet} tone="navy" />
        <MetricCard label="Dépenses (période)" value={data ? data.summary.totalExpenses : '—'} icon={TrendingDown} tone="orange" />
        <MetricCard label="Dépôts (période)" value={data ? data.summary.totalDeposits : '—'} icon={TrendingUp} tone="green" />
        <MetricCard label="Nombre de caisses" value={data ? `${data.summary.accountCount}` : '—'} icon={Landmark} tone="blue" />
      </section>

      <div className="toolbar-panel">
        <div className="toolbar-spacer" />
        <button className="btn-secondary" onClick={() => setAccountModalOpen(true)}><Plus size={14} /> Nouvelle caisse</button>
        <button className="btn-secondary" onClick={() => setTransferModalOpen(true)} disabled={accounts.length < 2}><ArrowLeftRight size={14} /> Transférer</button>
        <button className="btn-secondary" onClick={() => setDepositModalOpen(true)} disabled={accounts.length === 0}><ArrowUpCircle size={14} /> Nouveau dépôt</button>
        <button className="btn-primary" onClick={() => setExpenseModalOpen(true)} disabled={accounts.length === 0}><ArrowDownCircle size={14} /> Nouvelle dépense</button>
      </div>

      <section className="dashboard-grid" style={{ gridTemplateColumns: '1fr', marginBottom: 16 }}>
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Répartition des dépenses par catégorie</h2>
              <p>Où part l’argent sur la période sélectionnée — pour repérer ce qui pèse le plus et décider où économiser.</p>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            {(data?.expenseBreakdown.length ?? 0) > 0 ? (
              data!.expenseBreakdown.map((row, index) => (
                <ExpenseBreakdownBar
                  key={row.category}
                  row={row}
                  max={data!.expenseBreakdown[0].amount}
                  color={breakdownColors[index % breakdownColors.length]}
                />
              ))
            ) : (
              !loading && <p className="table-empty">Aucune dépense enregistrée sur cette période.</p>
            )}
          </div>
        </article>
      </section>

      {accounts.length > 0 && (
        <div className="store-card-grid" style={{ marginBottom: 16 }}>
          {accounts.map((account) => {
            const Icon = typeIcon[account.type]
            return (
              <article className="store-card" key={account.id}>
                <div className="store-card-head">
                  <span className="store-card-icon"><Icon aria-hidden="true" /></span>
                  <div>
                    <strong>
                      {account.name}
                      {account.isDefault && <Star size={12} style={{ color: 'var(--orange)', marginLeft: 6, verticalAlign: 'middle' }} fill="var(--orange)" />}
                    </strong>
                    <span>{typeLabel[account.type]}{account.isDefault ? ' · Caisse principale' : ''}</span>
                  </div>
                </div>
                <p className="metric-value" style={{ margin: 0 }}>{account.balanceFormatted}</p>
                {!account.isDefault && (
                  <button type="button" className="item-add-link" style={{ fontSize: 11, marginTop: 8 }} onClick={() => makeDefault(account.id)}>
                    Définir comme principale
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}

      <div className="table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Caisse</th>
                <th>Type</th>
                <th>Motif</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {(data?.movements ?? []).map((movement) => (
                <tr key={movement.id}>
                  <td data-label="Date">{new Date(movement.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td data-label="Caisse">{movement.account}</td>
                  <td data-label="Type"><span className={`badge ${movement.type === 'deposit' ? 'badge-green' : 'badge-orange'}`}>{movementTypeLabel[movement.type]}</span></td>
                  <td data-label="Motif">{movement.category}</td>
                  <td data-label="Montant">{movement.amountFormatted}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && (data?.movements.length ?? 0) === 0 && <p className="table-empty">Aucun mouvement enregistré sur cette période.</p>}
        </div>
      </div>

      <Modal open={accountModalOpen} onClose={() => setAccountModalOpen(false)} title="Nouvelle caisse" subtitle="Créez un compte (espèces, banque, Mobile Money...).">
        <NewAccountForm onCreated={() => { setAccountModalOpen(false); setRefreshKey((key) => key + 1) }} />
      </Modal>

      <Modal open={expenseModalOpen} onClose={() => setExpenseModalOpen(false)} title="Nouvelle dépense" subtitle="Choisissez la caisse, le montant et le motif.">
        <NewMovementForm type="expense" accounts={accounts} onCreated={() => { setExpenseModalOpen(false); setRefreshKey((key) => key + 1) }} />
      </Modal>

      <Modal open={depositModalOpen} onClose={() => setDepositModalOpen(false)} title="Nouveau dépôt" subtitle="Ajoutez de l’argent dans une caisse.">
        <NewMovementForm type="deposit" accounts={accounts} onCreated={() => { setDepositModalOpen(false); setRefreshKey((key) => key + 1) }} />
      </Modal>

      <Modal open={transferModalOpen} onClose={() => setTransferModalOpen(false)} title="Transférer entre caisses" subtitle="Déplacez de l’argent de la caisse principale vers une autre (ou inversement).">
        <TransferForm accounts={accounts} onCreated={() => { setTransferModalOpen(false); setRefreshKey((key) => key + 1) }} />
      </Modal>
    </AppShell>
  )
}
