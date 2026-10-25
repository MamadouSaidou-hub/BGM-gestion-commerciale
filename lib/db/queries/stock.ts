import { desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { products, stockCounts, stockLevels, stores, supplierDeliveries, suppliers } from '../schema'
import { formatFcfa } from '@/lib/format'
import { resolveStoreId } from './shared'

const statusOf = (quantity: number, threshold: number): 'critical' | 'low' | 'ok' =>
  quantity <= threshold / 2 ? 'critical' : quantity <= threshold ? 'low' : 'ok'

// Worst-first so a product's overall badge reflects its most urgent store, not an average.
const statusRank = { critical: 0, low: 1, ok: 2 } as const

export async function getStockOverview(storeName: string | null) {
  const storeId = await resolveStoreId(storeName)

  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      threshold: products.reorderThreshold,
      quantity: stockLevels.quantity,
      storeName: stores.name,
    })
    .from(stockLevels)
    .innerJoin(products, eq(stockLevels.productId, products.id))
    .innerJoin(stores, eq(stockLevels.storeId, stores.id))
    .where(storeId ? eq(stockLevels.storeId, storeId) : undefined)
    .orderBy(products.name)

  // Kept flat for CSV export and the "theoretical quantity" lookup in the stock-count form —
  // unchanged shape, nothing downstream of it needs to know about the new grouped view below.
  const items = rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    sku: row.sku,
    category: row.category,
    store: row.storeName,
    quantity: row.quantity,
    threshold: row.threshold,
    unitPrice: formatFcfa(row.unitPrice),
    unitPriceRaw: row.unitPrice,
    costPriceRaw: row.costPrice,
    status: statusOf(row.quantity, row.threshold),
  }))

  const deliveryRows = await db
    .select({
      productId: supplierDeliveries.productId,
      supplierName: suppliers.name,
      storeName: stores.name,
      sackCount: supplierDeliveries.sackCount,
      tonnage: supplierDeliveries.tonnage,
      totalAmount: supplierDeliveries.totalAmount,
      reference: supplierDeliveries.reference,
      createdAt: supplierDeliveries.createdAt,
    })
    .from(supplierDeliveries)
    .innerJoin(suppliers, eq(supplierDeliveries.supplierId, suppliers.id))
    .innerJoin(stores, eq(supplierDeliveries.storeId, stores.id))
    .where(storeId ? eq(supplierDeliveries.storeId, storeId) : undefined)
    .orderBy(desc(supplierDeliveries.createdAt))

  // One card per product — the flat (product, store) rows above collapse into a per-store
  // breakdown nested under each product, plus its supplier delivery history, instead of repeating
  // the same product name once per store it happens to be stocked in.
  const productMap = new Map<
    number,
    {
      productId: number
      name: string
      sku: string
      category: string
      unitPrice: string
      unitPriceRaw: number
      costPriceRaw: number
      totalQuantity: number
      status: 'critical' | 'low' | 'ok'
      stores: { store: string; quantity: number; threshold: number; status: 'critical' | 'low' | 'ok' }[]
      deliveries: {
        supplierName: string
        store: string
        sackCount: number
        tonnage: number | null
        totalAmountFormatted: string
        reference: string | null
        createdAt: string
      }[]
    }
  >()

  for (const row of rows) {
    if (!productMap.has(row.productId)) {
      productMap.set(row.productId, {
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        category: row.category,
        unitPrice: formatFcfa(row.unitPrice),
        unitPriceRaw: row.unitPrice,
        costPriceRaw: row.costPrice,
        totalQuantity: 0,
        status: 'ok',
        stores: [],
        deliveries: [],
      })
    }
    const product = productMap.get(row.productId)!
    const status = statusOf(row.quantity, row.threshold)
    product.totalQuantity += row.quantity
    product.stores.push({ store: row.storeName, quantity: row.quantity, threshold: row.threshold, status })
    if (statusRank[status] < statusRank[product.status]) product.status = status
  }

  for (const row of deliveryRows) {
    const product = productMap.get(row.productId)
    if (!product) continue // delivered to a store/product combo with no current stock_levels row (shouldn't happen, but don't crash)
    product.deliveries.push({
      supplierName: row.supplierName,
      store: row.storeName,
      sackCount: row.sackCount,
      tonnage: row.tonnage,
      totalAmountFormatted: formatFcfa(row.totalAmount),
      reference: row.reference,
      createdAt: row.createdAt,
    })
  }

  const productList = [...productMap.values()]
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)
  const lowCount = productList.filter((product) => product.status !== 'ok').length
  const stockValue = rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0)

  return {
    items,
    products: productList,
    summary: {
      totalArticles: productList.length,
      totalQuantity,
      lowCount,
      stockValue: formatFcfa(stockValue),
    },
  }
}

export async function getStockCountHistory(storeName: string | null) {
  const storeId = await resolveStoreId(storeName)

  const rows = await db
    .select({
      id: stockCounts.id,
      productName: products.name,
      sku: products.sku,
      storeName: stores.name,
      theoreticalQty: stockCounts.theoreticalQty,
      countedQty: stockCounts.countedQty,
      variance: stockCounts.variance,
      createdAt: stockCounts.createdAt,
    })
    .from(stockCounts)
    .innerJoin(products, eq(stockCounts.productId, products.id))
    .innerJoin(stores, eq(stockCounts.storeId, stores.id))
    .where(storeId ? eq(stockCounts.storeId, storeId) : undefined)
    .orderBy(desc(stockCounts.createdAt))
    .limit(50)

  return rows
}
