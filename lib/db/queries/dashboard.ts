import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '../client'
import { clients, payments, products, receivables, sales, stockLevels, stockMovements, stores, transfers } from '../schema'
import { formatFcfa, formatTrend, pctChange } from '@/lib/format'
import { periodRange, type PeriodKey } from '@/lib/period'
import { resolveStoreId } from './shared'

type Activity = { title: string; subtitle: string; amount: string; tone: 'green' | 'blue' | 'orange' | 'purple'; icon: 'sale' | 'stock' | 'payment' | 'transfer'; createdAt: string }

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Il y a ${hours} h`
  const days = Math.round(hours / 24)
  return `Il y a ${days} j`
}

export async function getDashboardData(period: PeriodKey, storeName: string | null) {
  const { start, previousStart } = periodRange(period)
  const storeId = await resolveStoreId(storeName)
  const storeFilter = storeId ? eq(sales.storeId, storeId) : undefined
  const stockFilter = storeId ? eq(stockLevels.storeId, storeId) : undefined

  const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const dayRanges = Array.from({ length: 7 }, (_, index) => {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    dayStart.setDate(dayStart.getDate() - (6 - index))
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    return { dayStart, dayEnd }
  })

  // All of the following are independent reads — running them concurrently instead of one `await` at a
  // time turns N sequential network round-trips to Supabase into 1 (the slowest of them), which matters
  // once the DB is no longer an in-process SQLite file.
  const [
    currentSalesRows,
    previousSalesRows,
    stockRows,
    receivableRows,
    salesTrendRows,
    storeRevenueRows,
    recentSales,
    recentMovements,
    recentPayments,
    recentTransfer,
    pendingTransferRows,
  ] = await Promise.all([
    db
      .select({ total: sales.totalAmount, cost: sales.costAmount })
      .from(sales)
      .where(and(gte(sales.createdAt, start.toISOString()), storeFilter)),
    db
      .select({ total: sales.totalAmount, cost: sales.costAmount })
      .from(sales)
      .where(and(gte(sales.createdAt, previousStart.toISOString()), lt(sales.createdAt, start.toISOString()), storeFilter)),
    db
      .select({
        quantity: stockLevels.quantity,
        threshold: products.reorderThreshold,
      })
      .from(stockLevels)
      .innerJoin(products, eq(stockLevels.productId, products.id))
      .where(stockFilter),
    db
      .select({ amount: receivables.amount, clientId: receivables.clientId })
      .from(receivables)
      .innerJoin(sales, eq(receivables.saleId, sales.id))
      .where(storeId ? and(eq(sales.storeId, storeId), eq(receivables.status, 'overdue')) : eq(receivables.status, 'overdue')),
    Promise.all(
      dayRanges.map(({ dayStart, dayEnd }) =>
        db
          .select({ total: sales.totalAmount })
          .from(sales)
          .where(and(gte(sales.createdAt, dayStart.toISOString()), lt(sales.createdAt, dayEnd.toISOString()), storeFilter))
          .then((rows) => ({ day: dayLabels[dayStart.getDay()], value: rows.reduce((sum, row) => sum + row.total, 0) })),
      ),
    ),
    db
      .select({
        storeId: sales.storeId,
        storeName: stores.name,
        total: sql<number>`sum(${sales.totalAmount})`.mapWith(Number),
      })
      .from(sales)
      .innerJoin(stores, eq(sales.storeId, stores.id))
      .where(gte(sales.createdAt, start.toISOString()))
      .groupBy(sales.storeId, stores.name),
    db
      .select({
        reference: sales.reference,
        total: sales.totalAmount,
        createdAt: sales.createdAt,
        storeName: stores.name,
      })
      .from(sales)
      .innerJoin(stores, eq(sales.storeId, stores.id))
      .where(storeFilter)
      .orderBy(desc(sales.createdAt))
      .limit(2),
    db
      .select({
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reference: stockMovements.reference,
        createdAt: stockMovements.createdAt,
        storeName: stores.name,
      })
      .from(stockMovements)
      .innerJoin(stores, eq(stockMovements.storeId, stores.id))
      .where(storeId ? eq(stockMovements.storeId, storeId) : undefined)
      .orderBy(desc(stockMovements.createdAt))
      .limit(2),
    db
      .select({
        amount: payments.amount,
        createdAt: payments.createdAt,
        clientName: clients.name,
      })
      .from(payments)
      .innerJoin(clients, eq(payments.clientId, clients.id))
      .where(storeId ? eq(payments.storeId, storeId) : undefined)
      .orderBy(desc(payments.createdAt))
      .limit(1),
    db
      .select({
        reference: transfers.reference,
        status: transfers.status,
        createdAt: transfers.createdAt,
        fromStoreName: stores.name,
      })
      .from(transfers)
      .innerJoin(stores, eq(transfers.fromStoreId, stores.id))
      .orderBy(desc(transfers.createdAt))
      .limit(1),
    db
      .select({ reference: transfers.reference, toStoreId: transfers.toStoreId })
      .from(transfers)
      .where(eq(transfers.status, 'in_transit'))
      .limit(1),
  ])

  const revenue = currentSalesRows.reduce((sum, row) => sum + row.total, 0)
  const previousRevenue = previousSalesRows.reduce((sum, row) => sum + row.total, 0)
  const margin = currentSalesRows.reduce((sum, row) => sum + (row.total - row.cost), 0)
  const previousMargin = previousSalesRows.reduce((sum, row) => sum + (row.total - row.cost), 0)
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0

  const lowStockRows = stockRows.filter((row) => row.quantity <= row.threshold)
  const criticalStockCount = lowStockRows.filter((row) => row.quantity <= row.threshold / 2).length

  const totalReceivables = receivableRows.reduce((sum, row) => sum + row.amount, 0)
  const distinctClients = new Set(receivableRows.map((row) => row.clientId)).size

  const salesTrend = salesTrendRows

  const totalAllStores = storeRevenueRows.reduce((sum, row) => sum + row.total, 0)
  const storePerformance = storeRevenueRows
    .map((row) => ({
      name: row.storeName,
      amount: row.total,
      pct: totalAllStores > 0 ? Math.round((row.total / totalAllStores) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  const activity: Activity[] = []

  for (const sale of recentSales) {
    activity.push({
      title: `Vente #${sale.reference}`,
      subtitle: `${sale.storeName} · ${relativeTime(sale.createdAt)}`,
      amount: `+ ${formatFcfa(sale.total)}`,
      tone: 'green',
      icon: 'sale',
      createdAt: sale.createdAt,
    })
  }
  for (const movement of recentMovements) {
    if (movement.type !== 'reception') continue
    activity.push({
      title: 'Réception stock',
      subtitle: `${movement.storeName} · ${relativeTime(movement.createdAt)}`,
      amount: `+ ${movement.quantity} articles`,
      tone: 'blue',
      icon: 'stock',
      createdAt: movement.createdAt,
    })
  }
  for (const payment of recentPayments) {
    activity.push({
      title: 'Paiement créance',
      subtitle: `Client : ${payment.clientName} · ${relativeTime(payment.createdAt)}`,
      amount: `+ ${formatFcfa(payment.amount)}`,
      tone: 'orange',
      icon: 'payment',
      createdAt: payment.createdAt,
    })
  }
  if (recentTransfer[0]) {
    const transfer = recentTransfer[0]
    activity.push({
      title: `Transfert #${transfer.reference}`,
      subtitle: `${transfer.fromStoreName} · ${relativeTime(transfer.createdAt)}`,
      amount: transfer.status === 'completed' ? 'Livré' : 'En transit',
      tone: 'purple',
      icon: 'transfer',
      createdAt: transfer.createdAt,
    })
  }
  activity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const alerts: { title: string; subtitle: string; tone: 'orange' | 'blue' | 'green' }[] = []
  if (lowStockRows.length > 0) {
    alerts.push({
      title: 'Stock critique',
      subtitle: `${criticalStockCount || lowStockRows.length} produits sous le seuil minimum`,
      tone: 'orange',
    })
  }
  if (distinctClients > 0) {
    alerts.push({
      title: 'Créances en retard',
      subtitle: `${distinctClients} échéances dépassées`,
      tone: 'blue',
    })
  }
  const pendingTransfer = pendingTransferRows[0]
  if (pendingTransfer) {
    const [toStore] = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, pendingTransfer.toStoreId))
    alerts.push({
      title: 'Transfert en cours',
      subtitle: `${pendingTransfer.reference} vers ${toStore?.name ?? ''}`,
      tone: 'green',
    })
  }

  return {
    metrics: {
      revenue: { value: formatFcfa(revenue), helper: `vs ${formatFcfa(previousRevenue)} période précédente`, trend: formatTrend(pctChange(revenue, previousRevenue)) },
      margin: { value: formatFcfa(margin), helper: `${marginPct.toFixed(1).replace('.', ',')} % de marge`, trend: formatTrend(pctChange(margin, previousMargin)) },
      lowStock: { value: `${lowStockRows.length} articles`, helper: `${criticalStockCount} nécessitent une action`, trend: '' },
      receivables: { value: formatFcfa(totalReceivables), helper: `${distinctClients} clients en retard`, trend: '' },
    },
    salesTrend,
    storePerformance,
    activity: activity.slice(0, 4),
    alerts: alerts.slice(0, 3),
  }
}
