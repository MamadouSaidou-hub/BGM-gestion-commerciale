import { and, eq, or } from 'drizzle-orm'
import { db } from '../client'
import { products, stockLevels, stores, transfers } from '../schema'
import { getDueDateAlerts } from './alerts'

export type NotificationItem = {
  id: string
  tone: 'red' | 'orange' | 'blue'
  title: string
  subtitle: string
  href: string
}

/**
 * Live, computed-on-read notifications — no persistence/read-tracking table. Reuses the same
 * overdue/low-stock/pending-transfer signals already surfaced elsewhere (dashboard alerts, due
 * banner) so the bell icon never disagrees with what those pages already show.
 */
export async function getNotifications(storeId: number | null, isAdminUser: boolean): Promise<NotificationItem[]> {
  const items: NotificationItem[] = []

  const dueAlerts = await getDueDateAlerts(storeId, isAdminUser)
  for (const alert of dueAlerts.overdue) {
    items.push({
      id: `due-${alert.kind}-${alert.name}-${alert.dueDate}`,
      tone: 'red',
      title: alert.kind === 'client' ? `Créance en retard — ${alert.name}` : `Dette fournisseur en retard — ${alert.name}`,
      subtitle: `${alert.amount} · échéance dépassée de ${Math.abs(alert.daysUntilDue)} j`,
      href: alert.kind === 'client' ? '/clients' : '/fournisseurs',
    })
  }
  for (const alert of dueAlerts.upcoming) {
    items.push({
      id: `soon-${alert.kind}-${alert.name}-${alert.dueDate}`,
      tone: 'orange',
      title: alert.kind === 'client' ? `Échéance proche — ${alert.name}` : `Paiement fournisseur proche — ${alert.name}`,
      subtitle: `${alert.amount} · dans ${alert.daysUntilDue} j`,
      href: alert.kind === 'client' ? '/clients' : '/fournisseurs',
    })
  }

  const stockRows = await db
    .select({
      productName: products.name,
      quantity: stockLevels.quantity,
      threshold: products.reorderThreshold,
      storeName: stores.name,
    })
    .from(stockLevels)
    .innerJoin(products, eq(stockLevels.productId, products.id))
    .innerJoin(stores, eq(stockLevels.storeId, stores.id))
    .where(storeId ? eq(stockLevels.storeId, storeId) : undefined)

  const lowStock = stockRows.filter((row) => row.quantity <= row.threshold)
  for (const row of lowStock.slice(0, 5)) {
    items.push({
      id: `stock-${row.productName}-${row.storeName}`,
      tone: row.quantity <= row.threshold / 2 ? 'red' : 'orange',
      title: `Stock critique — ${row.productName}`,
      subtitle: `${row.quantity} sac(s) restant(s) · ${row.storeName}`,
      href: '/stock',
    })
  }

  const transferRows = await db
    .select({ reference: transfers.reference, toStoreName: stores.name })
    .from(transfers)
    .innerJoin(stores, eq(transfers.toStoreId, stores.id))
    .where(storeId ? and(eq(transfers.status, 'in_transit'), or(eq(transfers.toStoreId, storeId), eq(transfers.fromStoreId, storeId))) : eq(transfers.status, 'in_transit'))

  for (const row of transferRows) {
    items.push({
      id: `transfer-${row.reference}`,
      tone: 'blue',
      title: `Transfert en cours — ${row.reference}`,
      subtitle: `Vers ${row.toStoreName}`,
      href: '/transferts',
    })
  }

  return items
}
