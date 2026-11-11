import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../client'
import { products, stores, supplierDeliveries, supplierPayables, supplierPayments, suppliers } from '../schema'
import { formatFcfa, isPastDue } from '@/lib/format'

export async function getSuppliersOverview() {
  const supplierRows = await db.select().from(suppliers)
  const payableRows = await db
    .select({ supplierId: supplierPayables.supplierId, amount: supplierPayables.amount, status: supplierPayables.status, dueDate: supplierPayables.dueDate })
    .from(supplierPayables)
  const paymentRows = await db
    .select({ supplierId: supplierPayments.supplierId, amount: supplierPayments.amount })
    .from(supplierPayments)
    .where(isNull(supplierPayments.deletedAt))
  const deliveryRows = await db
    .select({ supplierId: supplierDeliveries.supplierId, sackCount: supplierDeliveries.sackCount, createdAt: supplierDeliveries.createdAt })
    .from(supplierDeliveries)
    .where(isNull(supplierDeliveries.deletedAt))

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const result = supplierRows.map((supplier) => {
    const owedRows = payableRows.filter((row) => row.supplierId === supplier.id && row.status !== 'paid')
    const owed = owedRows.reduce((sum, row) => sum + row.amount, 0)
    const overdue = owedRows.some((row) => isPastDue(row.dueDate))
    const totalPaid = paymentRows.filter((row) => row.supplierId === supplier.id).reduce((sum, row) => sum + row.amount, 0)
    const deliveriesThisMonth = deliveryRows.filter((row) => row.supplierId === supplier.id && row.createdAt >= monthStart.toISOString())
    const sacksThisMonth = deliveriesThisMonth.reduce((sum, row) => sum + row.sackCount, 0)
    const status: 'ok' | 'pending' | 'overdue' = owed === 0 ? 'ok' : overdue ? 'overdue' : 'pending'
    return {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone ?? '—',
      owed: formatFcfa(owed),
      owedRaw: owed,
      totalPaid: formatFcfa(totalPaid),
      sacksThisMonth,
      status,
    }
  })

  const totalOwed = result.reduce((sum, supplier) => sum + supplier.owedRaw, 0)
  const deliveriesThisMonthCount = deliveryRows.filter((row) => row.createdAt >= monthStart.toISOString()).length

  return {
    suppliers: result.map(({ owedRaw, ...supplier }) => supplier),
    summary: {
      totalSuppliers: result.length,
      totalOwed: formatFcfa(totalOwed),
      deliveriesThisMonth: deliveriesThisMonthCount,
    },
  }
}

export async function getSupplierOptions() {
  return db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name)
}

export async function getSupplierDeliveryHistory(supplierId: number) {
  const rows = await db
    .select({
      id: supplierDeliveries.id,
      storeName: stores.name,
      productName: products.name,
      sackCount: supplierDeliveries.sackCount,
      tonnage: supplierDeliveries.tonnage,
      totalAmount: supplierDeliveries.totalAmount,
      reference: supplierDeliveries.reference,
      createdAt: supplierDeliveries.createdAt,
    })
    .from(supplierDeliveries)
    .innerJoin(stores, eq(supplierDeliveries.storeId, stores.id))
    .innerJoin(products, eq(supplierDeliveries.productId, products.id))
    .where(and(eq(supplierDeliveries.supplierId, supplierId), isNull(supplierDeliveries.deletedAt)))
    .orderBy(desc(supplierDeliveries.createdAt))

  return rows.map((row) => ({
    id: row.id,
    store: row.storeName,
    product: row.productName,
    sackCount: row.sackCount,
    tonnage: row.tonnage,
    totalAmountFormatted: formatFcfa(row.totalAmount),
    reference: row.reference,
    date: row.createdAt,
  }))
}

export async function getSupplierPaymentHistory(supplierId: number) {
  const rows = await db
    .select({ id: supplierPayments.id, amount: supplierPayments.amount, method: supplierPayments.method, createdAt: supplierPayments.createdAt })
    .from(supplierPayments)
    .where(and(eq(supplierPayments.supplierId, supplierId), isNull(supplierPayments.deletedAt)))
    .orderBy(desc(supplierPayments.createdAt))

  return rows.map((row) => ({ id: row.id, amount: row.amount, amountFormatted: formatFcfa(row.amount), method: row.method, date: row.createdAt }))
}
