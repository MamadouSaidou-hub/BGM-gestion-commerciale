import { and, eq, gte } from 'drizzle-orm'
import { db } from '../client'
import { products, sales, stockLevels, stores } from '../schema'
import { formatFcfa } from '@/lib/format'
import { periodRange } from '@/lib/period'

export async function getStoresOverview() {
  const { start } = periodRange('month')
  const storeRows = await db.select().from(stores)

  return Promise.all(
    storeRows.map(async (store) => {
      const salesRows = await db
        .select({ total: sales.totalAmount })
        .from(sales)
        .where(and(eq(sales.storeId, store.id), gte(sales.createdAt, start.toISOString())))
      const revenue = salesRows.reduce((sum, row) => sum + row.total, 0)

      const stockRows = await db
        .select({ quantity: stockLevels.quantity, threshold: products.reorderThreshold })
        .from(stockLevels)
        .innerJoin(products, eq(stockLevels.productId, products.id))
        .where(eq(stockLevels.storeId, store.id))
      const totalStock = stockRows.reduce((sum, row) => sum + row.quantity, 0)
      const lowStock = stockRows.filter((row) => row.quantity <= row.threshold).length

      return {
        id: store.id,
        name: store.name,
        city: store.city,
        revenue: formatFcfa(revenue),
        salesCount: salesRows.length,
        totalStock,
        lowStock,
      }
    }),
  )
}
