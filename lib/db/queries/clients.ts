import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../client'
import { clients, payments, receivables, sales, stores } from '../schema'
import { formatFcfa, isPastDue } from '@/lib/format'

export async function getClientsOverview(storeId: number | null = null) {
  const allClientRows = await db.select({ id: clients.id, name: clients.name, phone: clients.phone, storeId: clients.storeId }).from(clients)
  const clientRows = storeId ? allClientRows.filter((row) => row.storeId === storeId) : allClientRows
  const storeRows = await db.select({ id: stores.id, name: stores.name }).from(stores)
  const storeMap = new Map(storeRows.map((row) => [row.id, row.name]))

  const receivableRows = await db
    .select({ clientId: receivables.clientId, amount: receivables.amount, status: receivables.status, dueDate: receivables.dueDate })
    .from(receivables)

  const paymentRows = await db.select({ clientId: payments.clientId, amount: payments.amount }).from(payments).where(isNull(payments.deletedAt))

  const result = clientRows.map((client) => {
    const outstandingRows = receivableRows.filter((row) => row.clientId === client.id && row.status !== 'paid')
    const outstanding = outstandingRows.reduce((sum, row) => sum + row.amount, 0)
    const overdue = outstandingRows.some((row) => isPastDue(row.dueDate))
    const totalPaid = paymentRows.filter((row) => row.clientId === client.id).reduce((sum, row) => sum + row.amount, 0)
    const status: 'ok' | 'pending' | 'overdue' = outstanding === 0 ? 'ok' : overdue ? 'overdue' : 'pending'
    return {
      id: client.id,
      name: client.name,
      phone: client.phone ?? '—',
      storeId: client.storeId,
      store: client.storeId ? storeMap.get(client.storeId) ?? '—' : '—',
      outstanding: formatFcfa(outstanding),
      outstandingRaw: outstanding,
      totalPaid: formatFcfa(totalPaid),
      status,
    }
  })

  const totalOutstanding = result.reduce((sum, client) => sum + client.outstandingRaw, 0)
  const overdueCount = result.filter((client) => client.status === 'overdue').length

  return {
    clients: result.map(({ outstandingRaw, ...client }) => client),
    summary: {
      totalClients: result.length,
      totalOutstanding: formatFcfa(totalOutstanding),
      overdueCount,
    },
  }
}

export async function getClientPaymentHistory(clientId: number) {
  const rows = await db
    .select({ id: payments.id, amount: payments.amount, method: payments.method, createdAt: payments.createdAt, saleId: payments.saleId, saleReference: sales.reference })
    .from(payments)
    .leftJoin(sales, eq(payments.saleId, sales.id))
    .where(and(eq(payments.clientId, clientId), isNull(payments.deletedAt)))
    .orderBy(desc(payments.createdAt))

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    amountFormatted: formatFcfa(row.amount),
    method: row.method,
    date: row.createdAt,
    // Payments created alongside a sale (createSale/updateSale) are managed by that sale's own
    // edit/delete — editing them here directly would desync the sale's totalAmount/paymentStatus
    // from what it actually collected. The UI disables Modifier/Supprimer for these.
    linkedSaleReference: row.saleReference,
  }))
}
