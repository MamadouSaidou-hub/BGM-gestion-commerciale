import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { db } from '../client'
import { clients, payments, products, receivables, saleItems, sales, stores } from '../schema'
import { formatFcfa } from '@/lib/format'
import { periodRange, type PeriodKey } from '@/lib/period'
import { resolveStoreId } from './shared'

export async function getSalesList(period: PeriodKey, storeName: string | null) {
  const { start } = periodRange(period)
  const storeId = await resolveStoreId(storeName)
  const storeFilter = storeId ? eq(sales.storeId, storeId) : undefined

  const rows = await db
    .select({
      reference: sales.reference,
      createdAt: sales.createdAt,
      totalAmount: sales.totalAmount,
      paymentStatus: sales.paymentStatus,
      storeName: stores.name,
      clientName: clients.name,
    })
    .from(sales)
    .innerJoin(stores, eq(sales.storeId, stores.id))
    .leftJoin(clients, eq(sales.clientId, clients.id))
    .where(and(gte(sales.createdAt, start.toISOString()), storeFilter, isNull(sales.deletedAt)))
    .orderBy(desc(sales.createdAt))

  const totalRevenue = rows.reduce((sum, row) => sum + row.totalAmount, 0)
  const creditCount = rows.filter((row) => row.paymentStatus !== 'paid').length
  const avgBasket = rows.length > 0 ? totalRevenue / rows.length : 0

  return {
    sales: rows.map((row) => ({
      reference: row.reference,
      date: row.createdAt,
      store: row.storeName,
      client: row.clientName ?? '—',
      amount: formatFcfa(row.totalAmount),
      status: row.paymentStatus,
    })),
    summary: {
      count: rows.length,
      totalRevenue: formatFcfa(totalRevenue),
      avgBasket: formatFcfa(avgBasket),
      creditCount,
    },
  }
}

export async function getSaleDetail(reference: string) {
  const [sale] = await db
    .select({
      id: sales.id,
      reference: sales.reference,
      createdAt: sales.createdAt,
      storeId: sales.storeId,
      storeName: stores.name,
      storeCity: stores.city,
      clientId: sales.clientId,
      clientName: clients.name,
      clientPhone: clients.phone,
      totalAmount: sales.totalAmount,
      paymentStatus: sales.paymentStatus,
    })
    .from(sales)
    .innerJoin(stores, eq(sales.storeId, stores.id))
    .leftJoin(clients, eq(sales.clientId, clients.id))
    .where(eq(sales.reference, reference))

  if (!sale) return null

  const items = await db
    .select({
      productId: saleItems.productId,
      productName: products.name,
      sku: products.sku,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      unit: saleItems.unit,
      tonnage: saleItems.tonnage,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, sale.id))

  const [receivable] = await db
    .select({ amount: receivables.amount, dueDate: receivables.dueDate, status: receivables.status })
    .from(receivables)
    .where(eq(receivables.saleId, sale.id))

  // How much was actually paid at sale time — used to pre-fill the edit form's "montant payé"
  // field; `payments.saleId` is the one unambiguous link to this specific sale (see the note on
  // reverseSaleEffects for why this can't be derived from anywhere else).
  const paidRows = await db.select({ amount: payments.amount }).from(payments).where(eq(payments.saleId, sale.id))
  const paidAmount = paidRows.reduce((sum, row) => sum + row.amount, 0)

  return {
    reference: sale.reference,
    date: sale.createdAt,
    storeId: sale.storeId,
    storeName: sale.storeName,
    storeCity: sale.storeCity,
    clientId: sale.clientId,
    clientName: sale.clientName ?? 'Vente comptoir',
    clientPhone: sale.clientPhone,
    paymentStatus: sale.paymentStatus,
    paidAmount,
    totalAmount: sale.totalAmount,
    totalAmountFormatted: formatFcfa(sale.totalAmount),
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unit: item.unit,
      tonnage: item.tonnage,
      unitPriceFormatted: formatFcfa(item.unitPrice),
      lineTotalFormatted: formatFcfa(item.quantity * item.unitPrice),
    })),
    receivable: receivable
      ? { amount: receivable.amount, amountFormatted: formatFcfa(receivable.amount), dueDate: receivable.dueDate, status: receivable.status }
      : null,
  }
}
