import { desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../client'
import { products, saleItems, sales, stores } from '../schema'
import { formatFcfa } from '@/lib/format'
import { periodRange, type PeriodKey } from '@/lib/period'

export async function getReportsOverview(period: PeriodKey) {
  const { start } = periodRange(period)

  const storeRevenueRows = await db
    .select({ storeName: stores.name, total: sql<number>`sum(${sales.totalAmount})`.mapWith(Number) })
    .from(sales)
    .innerJoin(stores, eq(sales.storeId, stores.id))
    .where(gte(sales.createdAt, start.toISOString()))
    .groupBy(stores.name)

  const itemRows = await db
    .select({
      productName: products.name,
      quantity: sql<number>`sum(${saleItems.quantity})`.mapWith(Number),
      revenue: sql<number>`sum(${saleItems.quantity} * ${saleItems.unitPrice})`.mapWith(Number),
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(gte(sales.createdAt, start.toISOString()))
    .groupBy(products.name)
    .orderBy(desc(sql`sum(${saleItems.quantity} * ${saleItems.unitPrice})`))
    .limit(6)

  const totalRevenue = storeRevenueRows.reduce((sum, row) => sum + row.total, 0)

  return {
    storeRevenue: storeRevenueRows.map((row) => ({ name: row.storeName, amount: formatFcfa(row.total) })),
    topProducts: itemRows.map((row) => ({ name: row.productName, quantity: row.quantity, revenue: formatFcfa(row.revenue) })),
    totalRevenue: formatFcfa(totalRevenue),
  }
}
