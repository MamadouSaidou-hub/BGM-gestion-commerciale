import { db } from '../client'
import { supplierDeliveries, supplierPayables, supplierPayments, suppliers } from '../schema'
import { formatFcfa } from '@/lib/format'

export async function getSuppliersOverview() {
  const supplierRows = await db.select().from(suppliers)
  const payableRows = await db.select({ supplierId: supplierPayables.supplierId, amount: supplierPayables.amount, status: supplierPayables.status }).from(supplierPayables)
  const paymentRows = await db.select({ supplierId: supplierPayments.supplierId, amount: supplierPayments.amount }).from(supplierPayments)
  const deliveryRows = await db.select({ supplierId: supplierDeliveries.supplierId, sackCount: supplierDeliveries.sackCount, createdAt: supplierDeliveries.createdAt }).from(supplierDeliveries)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const result = supplierRows.map((supplier) => {
    const owedRows = payableRows.filter((row) => row.supplierId === supplier.id && row.status !== 'paid')
    const owed = owedRows.reduce((sum, row) => sum + row.amount, 0)
    const overdue = owedRows.some((row) => row.status === 'overdue')
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
