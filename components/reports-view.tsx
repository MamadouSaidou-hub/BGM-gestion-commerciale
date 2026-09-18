'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, TrendingUp } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { LoadError } from '@/components/load-error'
import { fetchJson } from '@/lib/fetch-json'

const periods = ['Aujourd’hui', '7 derniers jours', 'Ce mois-ci']

type ReportsData = {
  storeRevenue: { name: string; amount: string }[]
  topProducts: { name: string; quantity: number; revenue: string }[]
  totalRevenue: string
}

export function ReportsView() {
  const [period, setPeriod] = useState(periods[2])
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchJson<ReportsData>(`/api/rapports?period=${encodeURIComponent(period)}`)
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

  return (
    <AppShell breadcrumb="Pilotage" section="Rapports">
      <section className="page-heading">
        <div><p className="eyebrow">SYNTHÈSE</p><h1>Rapports <span>d’activité</span></h1><p className="heading-subtitle">Chiffre d’affaires par magasin et produits les plus vendus.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Période</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
        </div>
      </section>

      {error && <LoadError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><h2 className="section-title">Chiffre d’affaires par magasin</h2><p className="section-subtitle">Total période : {loading ? '…' : data?.totalRevenue}</p></div></div>
          <div className="store-legend" style={{ marginTop: 8 }}>
            {(data?.storeRevenue ?? []).map((row) => (
              <div key={row.name}><span className="legend-dot navy-dot" /><div><strong>{row.name}</strong></div><b>{row.amount}</b></div>
            ))}
            {!loading && (data?.storeRevenue.length ?? 0) === 0 && <p className="table-empty">Aucune vente sur cette période.</p>}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2 className="section-title">Top produits vendus</h2><p className="section-subtitle">Par chiffre d’affaires généré</p></div><TrendingUp size={16} color="var(--faint)" /></div>
          <div className="activity-list">
            {(data?.topProducts ?? []).map((product) => (
              <div className="activity-row" key={product.name}>
                <div className="activity-copy"><strong>{product.name}</strong><span>{product.quantity} unités vendues</span></div>
                <b>{product.revenue}</b>
              </div>
            ))}
            {!loading && (data?.topProducts.length ?? 0) === 0 && <p className="table-empty">Aucune donnée disponible.</p>}
          </div>
        </article>
      </section>
    </AppShell>
  )
}
