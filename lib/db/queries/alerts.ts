import { eq, ne } from 'drizzle-orm'
import { db } from '../client'
import { clients, receivables, sales, stores, supplierPayables, suppliers } from '../schema'
import { formatFcfa } from '@/lib/format'

export type DueAlert = {
  kind: 'client' | 'supplier'
  name: string
  amount: string
  dueDate: string
  daysUntilDue: number
}

function daysUntil(dueDate: string): number {
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export async function getDueDateAlerts(storeId: number | null, includeSuppliers: boolean) {
  const receivableRows = await db
    .select({
      amount: receivables.amount,
      dueDate: receivables.dueDate,
      clientName: clients.name,
      storeId: sales.storeId,
    })
    .from(receivables)
    .innerJoin(sales, eq(receivables.saleId, sales.id))
    .innerJoin(clients, eq(receivables.clientId, clients.id))
    .where(ne(receivables.status, 'paid'))

  const scopedReceivables = storeId ? receivableRows.filter((row) => row.storeId === storeId) : receivableRows

  const alerts: DueAlert[] = scopedReceivables.map((row) => ({
    kind: 'client' as const,
    name: row.clientName,
    amount: formatFcfa(row.amount),
    dueDate: row.dueDate,
    daysUntilDue: daysUntil(row.dueDate),
  }))

  if (includeSuppliers) {
    const payableRows = await db
      .select({ amount: supplierPayables.amount, dueDate: supplierPayables.dueDate, supplierName: suppliers.name })
      .from(supplierPayables)
      .innerJoin(suppliers, eq(supplierPayables.supplierId, suppliers.id))
      .where(ne(supplierPayables.status, 'paid'))

    for (const row of payableRows) {
      alerts.push({
        kind: 'supplier',
        name: row.supplierName,
        amount: formatFcfa(row.amount),
        dueDate: row.dueDate,
        daysUntilDue: daysUntil(row.dueDate),
      })
    }
  }

  const overdue = alerts.filter((alert) => alert.daysUntilDue < 0).sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  const upcoming = alerts.filter((alert) => alert.daysUntilDue >= 0 && alert.daysUntilDue <= 7).sort((a, b) => a.daysUntilDue - b.daysUntilDue)

  return { overdue, upcoming }
}
