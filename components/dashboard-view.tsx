'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  ChevronDown,
  CreditCard,
  Package,
  ShoppingCart,
  Store,
  WalletCards,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'

const periods = ['Aujourd’hui', '7 derniers jours', 'Ce mois-ci']

type Metric = { value: string; helper: string; trend: string }
type DueAlert = { kind: 'client' | 'supplier'; name: string; amount: string; dueDate: string; daysUntilDue: number }
type DashboardData = {
  stores: string[]
  metrics: { revenue: Metric; margin: Metric; lowStock: Metric; receivables: Metric }
  salesTrend: { day: string; value: number }[]
  storePerformance: { name: string; amount: number; pct: number }[]
  activity: { title: string; subtitle: string; amount: string; tone: 'green' | 'blue' | 'orange' | 'purple'; icon: 'sale' | 'stock' | 'payment' | 'transfer' }[]
  alerts: { title: string; subtitle: string; tone: 'orange' | 'blue' | 'green' }[]
  dueAlerts: { overdue: DueAlert[]; upcoming: DueAlert[] }
}

const activityIcons = { sale: ShoppingCart, stock: Package, payment: CreditCard, transfer: Store }
const alertIcons = { orange: AlertTriangle, blue: CreditCard, green: ArrowDownRight }
const alertToneClass = { orange: 'orange-symbol', blue: 'blue-symbol', green: 'green-symbol' }
const legendDotClass = ['navy-dot', 'green-dot', 'orange-dot', 'blue-dot']

function MetricCard({ label, value, helper, trend, icon: Icon, tone }: { label: string; value: string; helper: string; trend: string; icon: typeof Store; tone: 'navy' | 'green' | 'orange' | 'blue' }) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span className={`metric-icon metric-icon-${tone}`}><Icon aria-hidden="true" /></span>
        {trend && <span className="metric-trend"><ArrowUpRight aria-hidden="true" />{trend}</span>}
      </div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-helper">{helper}</p>
    </article>
  )
}

export function DashboardView() {
  const [period, setPeriod] = useState(periods[0])
  const [store, setStore] = useState('Tous les magasins')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ period, store })
    fetch(`/api/dashboard?${params.toString()}`)
      .then((res) => res.json())
      .then((json: DashboardData) => {
        if (!cancelled) setData(json)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, store])

  const stores = data?.stores ?? ['Tous les magasins']
  const sales = data?.salesTrend ?? []
  const maxSales = useMemo(() => Math.max(1, ...sales.map((item) => item.value)), [sales])
  const totalPeriodRevenue = useMemo(() => sales.reduce((sum, item) => sum + item.value, 0), [sales])
  const storeTotal = useMemo(() => (data?.storePerformance ?? []).reduce((sum, item) => sum + item.amount, 0), [data])

  const today = new Date()
  const dateLabel = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()

  return (
    <AppShell breadcrumb="Vue d’ensemble" section="Tableau de bord">
      <section className="page-heading">
        <div><p className="eyebrow">{dateLabel}</p><h1>Bonjour Alain, <span>voici votre activité.</span></h1><p className="heading-subtitle">Gardez un œil sur vos opérations et vos performances.</p></div>
        <div className="filter-row">
          <label className="select-wrap"><span className="sr-only">Période</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
          <label className="select-wrap"><span className="sr-only">Magasin</span><select value={store} onChange={(event) => setStore(event.target.value)}>{stores.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
        </div>
      </section>

      {data && (data.dueAlerts.overdue.length > 0 || data.dueAlerts.upcoming.length > 0) && (
        <section className="due-banner" aria-label="Échéances">
          {data.dueAlerts.overdue.slice(0, 5).map((alert, index) => (
            <div className="due-banner-row due-banner-overdue" key={`overdue-${index}`}>
              <AlertTriangle size={14} />
              <span><strong>{alert.name}</strong> ({alert.kind === 'client' ? 'client' : 'fournisseur'}) — {alert.amount} en retard de {Math.abs(alert.daysUntilDue)} jour{Math.abs(alert.daysUntilDue) > 1 ? 's' : ''}</span>
            </div>
          ))}
          {data.dueAlerts.upcoming.slice(0, 5).map((alert, index) => (
            <div className="due-banner-row due-banner-upcoming" key={`upcoming-${index}`}>
              <Clock size={14} />
              <span><strong>{alert.name}</strong> ({alert.kind === 'client' ? 'client' : 'fournisseur'}) — {alert.amount} échéance dans {alert.daysUntilDue === 0 ? "aujourd’hui" : `${alert.daysUntilDue} jour${alert.daysUntilDue > 1 ? 's' : ''}`}</span>
            </div>
          ))}
          {(data.dueAlerts.overdue.length > 5 || data.dueAlerts.upcoming.length > 5) && (
            <div className="due-banner-more">+ {Math.max(0, data.dueAlerts.overdue.length - 5) + Math.max(0, data.dueAlerts.upcoming.length - 5)} autre(s) échéance(s)</div>
          )}
        </section>
      )}

      <section className="metrics-grid" aria-label="Indicateurs clés">
        <MetricCard label="Chiffre d’affaires" value={data?.metrics.revenue.value ?? '—'} helper={data?.metrics.revenue.helper ?? ''} trend={data?.metrics.revenue.trend ?? ''} icon={WalletCards} tone="navy" />
        <MetricCard label="Marge brute" value={data?.metrics.margin.value ?? '—'} helper={data?.metrics.margin.helper ?? ''} trend={data?.metrics.margin.trend ?? ''} icon={ArrowUpRight} tone="green" />
        <MetricCard label="Articles en stock faible" value={data?.metrics.lowStock.value ?? '—'} helper={data?.metrics.lowStock.helper ?? ''} trend={data?.metrics.lowStock.trend ?? ''} icon={AlertTriangle} tone="orange" />
        <MetricCard label="Créances à recouvrer" value={data?.metrics.receivables.value ?? '—'} helper={data?.metrics.receivables.helper ?? ''} trend={data?.metrics.receivables.trend ?? ''} icon={CreditCard} tone="blue" />
      </section>

      <section className="dashboard-grid">
        <article className="panel sales-panel">
          <div className="panel-header"><div><h2>Évolution des ventes</h2><p>Chiffre d’affaires sur la période sélectionnée</p></div><div className="legend"><span /><span>Ventes</span></div></div>
          <div className="chart-wrap">
            <div className="chart-y"><span>{Math.round(maxSales / 1000)}K</span><span>{Math.round((maxSales * 0.66) / 1000)}K</span><span>{Math.round((maxSales * 0.33) / 1000)}K</span><span>0</span></div>
            <div className="bar-chart">{sales.map((item) => <div className="bar-group" key={item.day}><div className="bar-track"><div className="bar" style={{ height: `${(item.value / maxSales) * 100}%` }} /></div><span>{item.day}</span></div>)}</div>
          </div>
          <div className="chart-total"><strong>{loading ? '…' : `${(totalPeriodRevenue / 1_000_000).toFixed(2)}M FCFA`}</strong><span><ArrowUpRight /> {data?.metrics.revenue.trend ?? ''} vs période précédente</span></div>
        </article>
        <article className="panel store-panel">
          <div className="panel-header"><div><h2>Performance magasins</h2><p>Répartition du chiffre d’affaires</p></div><button className="more-button" aria-label="Plus d'options">•••</button></div>
          <div className="store-list">
            <div className="donut"><div><strong>{(storeTotal / 1_000_000).toFixed(1)}M</strong><span>Total CA</span></div></div>
            <div className="store-legend">
              {(data?.storePerformance ?? []).map((item, index) => (
                <div key={item.name}><span className={`legend-dot ${legendDotClass[index % legendDotClass.length]}`} /><div><strong>{item.name}</strong><small>{item.pct} %</small></div><b>{(item.amount / 1_000_000).toFixed(2)}M</b></div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="bottom-grid">
        <article className="panel activity-panel">
          <div className="panel-header"><div><h2>Activité récente</h2><p>Les dernières opérations de vos magasins</p></div><a href="/rapports" className="text-link">Voir tout <ArrowUpRight /></a></div>
          <div className="activity-list">
            {(data?.activity ?? []).map(({ title, subtitle, amount, tone, icon }) => {
              const Icon = activityIcons[icon]
              return (
                <div className="activity-row" key={title + subtitle}><span className={`activity-icon activity-${tone}`}><Icon /></span><div className="activity-copy"><strong>{title}</strong><span>{subtitle}</span></div><b className={tone === 'green' ? 'amount-positive' : ''}>{amount}</b></div>
              )
            })}
            {!loading && (data?.activity.length ?? 0) === 0 && <p className="heading-subtitle">Aucune activité récente.</p>}
          </div>
        </article>
        <article className="panel alert-panel">
          <div className="panel-header"><div><h2>À surveiller</h2><p>Points nécessitant votre attention</p></div><span className="alert-number">{data?.alerts.length ?? 0}</span></div>
          <div className="alert-list">
            {(data?.alerts ?? []).map(({ title, subtitle, tone }) => {
              const Icon = alertIcons[tone]
              return (
                <div key={title}><span className={`alert-symbol ${alertToneClass[tone]}`}><Icon /></span><div><strong>{title}</strong><span>{subtitle}</span></div><ArrowUpRight /></div>
              )
            })}
            {!loading && (data?.alerts.length ?? 0) === 0 && <p className="heading-subtitle">Rien à signaler.</p>}
          </div>
        </article>
      </section>
    </AppShell>
  )
}
