'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, CreditCard, Download, FileSpreadsheet, ShoppingCart, TrendingUp, Truck, WalletCards } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { LoadError } from '@/components/load-error'
import { fetchJson } from '@/lib/fetch-json'
import { exportReportExcel, exportReportPdf, type ReportsData } from '@/lib/export-report'

const periods = ['Aujourd’hui', '7 derniers jours', 'Ce mois-ci']

const paymentDotClass: Record<string, string> = { paid: 'green-dot', partial: 'orange-dot', credit: 'blue-dot' }
const paymentColorVar: Record<string, string> = { paid: 'var(--green)', partial: 'var(--orange)', credit: 'var(--blue)' }
const storeColorVar = ['var(--primary)', 'var(--green)', 'var(--orange)', 'var(--blue)']

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof WalletCards; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline"><span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  )
}

function RankBar({ label, value, formatted, max, color }: { label: string; value: number; formatted: string; max: number; color: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0
  return (
    <div className="rank-bar-row">
      <span className="rank-bar-label" title={label}>{label}</span>
      <div className="rank-bar-track"><div className="rank-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="rank-bar-value">{formatted}</span>
    </div>
  )
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

  const maxTrend = useMemo(() => Math.max(1, ...(data?.salesTrend ?? []).map((row) => row.value)), [data])
  const maxStore = useMemo(() => Math.max(1, ...(data?.storeRevenue ?? []).map((row) => row.amount)), [data])
  const maxProduct = useMemo(() => Math.max(1, ...(data?.topProducts ?? []).map((row) => row.revenue)), [data])
  const maxClient = useMemo(() => Math.max(1, ...(data?.topClients ?? []).map((row) => row.revenue)), [data])
  const maxPaymentAmount = useMemo(() => Math.max(1, ...(data?.paymentBreakdown ?? []).map((row) => row.amount)), [data])

  return (
    <AppShell breadcrumb="Pilotage" section="Rapports">
      <section className="page-heading">
        <div><p className="eyebrow">SYNTHÈSE</p><h1>Rapports <span>d’activité</span></h1><p className="heading-subtitle">Statistiques, tendances et export du rapport de la période.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Période</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
          <div className="export-group">
            <button className="btn-secondary" disabled={!data} onClick={() => data && exportReportPdf(data, period)}><Download size={13} /> PDF</button>
            <button className="btn-secondary" disabled={!data} onClick={() => data && exportReportExcel(data, period)}><FileSpreadsheet size={13} /> Excel</button>
          </div>
        </div>
      </section>

      {error && <LoadError message={error} onRetry={() => setRefreshKey((key) => key + 1)} />}

      <section className="metrics-grid" aria-label="Indicateurs rapport">
        <MetricCard label="Chiffre d’affaires" value={data ? data.totalRevenueFormatted : '—'} icon={WalletCards} tone="navy" />
        <MetricCard label="Marge brute" value={data ? `${data.totalMarginFormatted}` : '—'} icon={TrendingUp} tone="green" />
        <MetricCard label="Nombre de ventes" value={data ? `${data.salesCount}` : '—'} icon={ShoppingCart} tone="blue" />
        <MetricCard label="Panier moyen" value={data ? data.avgBasketFormatted : '—'} icon={CreditCard} tone="orange" />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><h2>Évolution des ventes</h2><p>Chiffre d’affaires sur la période sélectionnée</p></div></div>
          <div className="chart-wrap">
            <div className="chart-y">
              <span>{Math.round(maxTrend / 1000)}K</span>
              <span>{Math.round((maxTrend * 0.5) / 1000)}K</span>
              <span>0</span>
            </div>
            <div className="bar-chart">
              {(data?.salesTrend ?? []).map((point, index) => (
                <div className="bar-group" key={`${point.label}-${index}`}>
                  <div className="bar-track"><div className="bar" style={{ height: `${(point.value / maxTrend) * 100}%` }} title={point.label} /></div>
                  <span>{point.label}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>Statuts de paiement</h2><p>Répartition des ventes de la période</p></div></div>
          <div style={{ marginTop: 8 }}>
            {(data?.paymentBreakdown ?? []).map((row) => (
              <div className="payment-status-row" key={row.status}>
                <span className={`legend-dot ${paymentDotClass[row.status] ?? 'navy-dot'}`} />
                <div className="payment-status-copy">
                  <strong>{row.label}</strong>
                  <span>{row.count} vente{row.count > 1 ? 's' : ''}</span>
                  <div className="rank-bar-track" style={{ marginTop: 5 }}>
                    <div className="rank-bar-fill" style={{ width: `${Math.max((row.amount / maxPaymentAmount) * 100, 2)}%`, background: paymentColorVar[row.status] ?? 'var(--primary)' }} />
                  </div>
                </div>
                <b>{row.formatted}</b>
              </div>
            ))}
            {!loading && (data?.paymentBreakdown.length ?? 0) === 0 && <p className="table-empty">Aucune vente sur cette période.</p>}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><h2>Chiffre d’affaires par magasin</h2><p>Total période : {loading ? '…' : data?.totalRevenueFormatted}</p></div></div>
          <div style={{ marginTop: 12 }}>
            {(data?.storeRevenue ?? []).map((row, index) => (
              <RankBar key={row.name} label={row.name} value={row.amount} formatted={row.formatted} max={maxStore} color={storeColorVar[index % storeColorVar.length]} />
            ))}
            {!loading && (data?.storeRevenue.length ?? 0) === 0 && <p className="table-empty">Aucune vente sur cette période.</p>}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>Fournisseurs</h2><p>Réceptions sur la période</p></div><Truck size={16} color="var(--faint)" /></div>
          <div className="store-legend" style={{ marginTop: 8 }}>
            <div><span className="legend-dot navy-dot" /><div><strong>Sacs reçus</strong></div><b>{data ? data.supplierSummary.totalSacks : '—'}</b></div>
            <div><span className="legend-dot green-dot" /><div><strong>Livraisons</strong></div><b>{data ? data.supplierSummary.deliveriesCount : '—'}</b></div>
            <div><span className="legend-dot orange-dot" /><div><strong>Payé aux fournisseurs</strong></div><b>{data ? data.supplierSummary.totalPaidFormatted : '—'}</b></div>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><h2 className="section-title">Top produits vendus</h2><p className="section-subtitle">Par chiffre d’affaires généré</p></div><TrendingUp size={16} color="var(--faint)" /></div>
          <div>
            {(data?.topProducts ?? []).map((row) => (
              <RankBar key={row.name} label={row.name} value={row.revenue} formatted={row.formatted} max={maxProduct} color="var(--primary)" />
            ))}
            {!loading && (data?.topProducts.length ?? 0) === 0 && <p className="table-empty">Aucune donnée disponible.</p>}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2 className="section-title">Top clients</h2><p className="section-subtitle">Par chiffre d’affaires généré</p></div></div>
          <div>
            {(data?.topClients ?? []).map((row) => (
              <RankBar key={row.name} label={row.name} value={row.revenue} formatted={row.formatted} max={maxClient} color="var(--blue)" />
            ))}
            {!loading && (data?.topClients.length ?? 0) === 0 && <p className="table-empty">Aucune vente client sur cette période.</p>}
          </div>
        </article>
      </section>
    </AppShell>
  )
}
