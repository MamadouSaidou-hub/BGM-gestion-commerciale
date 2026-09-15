import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '../client'
import { clients, payments, receivables, sales, stores, supplierPayables, supplierPayments } from '../schema'
import { formatFcfa } from '@/lib/format'
import { periodRange, type PeriodKey } from '@/lib/period'
import { resolveStoreId } from './shared'

export async function getTreasuryOverview(period: PeriodKey, storeName: string | null) {
  const { start } = periodRange(period)
  const storeId = await resolveStoreId(storeName)

  // Independent reads — run concurrently rather than one `await` at a time (see the same fix in
  // dashboard.ts for why this matters once the DB is a remote Supabase instance, not in-process SQLite).
  const [paymentRows, salesRows, receivableRows, supplierPaymentRows, supplierPayableRows] = await Promise.all([
    db
      .select({
        amount: payments.amount,
        method: payments.method,
        createdAt: payments.createdAt,
        storeName: stores.name,
        clientName: clients.name,
      })
      .from(payments)
      .innerJoin(stores, eq(payments.storeId, stores.id))
      .innerJoin(clients, eq(payments.clientId, clients.id))
      .where(and(gte(payments.createdAt, start.toISOString()), storeId ? eq(payments.storeId, storeId) : undefined))
      .orderBy(desc(payments.createdAt)),
    db
      .select({ total: sales.totalAmount, status: sales.paymentStatus })
      .from(sales)
      .where(and(gte(sales.createdAt, start.toISOString()), storeId ? eq(sales.storeId, storeId) : undefined)),
    db
      .select({ amount: receivables.amount, status: receivables.status, storeId: sales.storeId })
      .from(receivables)
      .innerJoin(sales, eq(receivables.saleId, sales.id)),
    // Supplier-side figures are store-agnostic (the supplier relationship is managed centrally, not per-store).
    db
      .select({ amount: supplierPayments.amount })
      .from(supplierPayments)
      .where(gte(supplierPayments.createdAt, start.toISOString())),
    db.select({ amount: supplierPayables.amount, status: supplierPayables.status }).from(supplierPayables),
  ])

  const cashSales = salesRows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.total, 0)
  const totalPayments = paymentRows.reduce((sum, row) => sum + row.amount, 0)

  const outstandingReceivables = receivableRows
    .filter((row) => row.status !== 'paid' && (!storeId || row.storeId === storeId))
    .reduce((sum, row) => sum + row.amount, 0)

  const totalSupplierPayments = supplierPaymentRows.reduce((sum, row) => sum + row.amount, 0)
  const outstandingPayables = supplierPayableRows.filter((row) => row.status !== 'paid').reduce((sum, row) => sum + row.amount, 0)

  return {
    payments: paymentRows.map((row) => ({
      date: row.createdAt,
      client: row.clientName,
      store: row.storeName,
      amount: formatFcfa(row.amount),
      method: row.method,
    })),
    summary: {
      totalEncaisse: formatFcfa(totalPayments + cashSales),
      cashSales: formatFcfa(cashSales),
      totalPayments: formatFcfa(totalPayments),
      outstandingReceivables: formatFcfa(outstandingReceivables),
      totalSupplierPayments: formatFcfa(totalSupplierPayments),
      outstandingPayables: formatFcfa(outstandingPayables),
    },
  }
}
