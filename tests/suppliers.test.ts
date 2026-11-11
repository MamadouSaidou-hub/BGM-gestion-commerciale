import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { auditLog, products, saleItems, sales, stockLevels, stores, supplierDeliveries, supplierPayables, suppliers } from '@/lib/db/schema'
import { recordSupplierDelivery, updateSupplierDelivery, deleteSupplierDelivery } from '@/lib/db/mutations/suppliers'
import { createSale } from '@/lib/db/mutations/sales'

const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const testActor = { userId: `test-actor-${runId}`, userName: 'Test Suite' }

let storeId: number
let supplierId: number
let productId: number
const deliveryIds: number[] = []
const saleIds: number[] = []
const extraProductIds: number[] = []

async function stockOf(forProductId = productId) {
  const [row] = await db.select({ quantity: stockLevels.quantity }).from(stockLevels).where(and(eq(stockLevels.productId, forProductId), eq(stockLevels.storeId, storeId)))
  return row?.quantity ?? 0
}

/**
 * A fresh product+stock row, isolated from the describe-level `productId` — needed whenever a
 * test depends on stock starting at exactly 0 (e.g. the "stock insuffisant" cases below), since
 * the shared `productId` accumulates stock across every other test in this file.
 */
async function isolatedProduct() {
  const [product] = await db.insert(products).values({ name: `Produit isolé ${runId}-${extraProductIds.length}`, sku: `SKU-SUP-ISO-${runId}-${extraProductIds.length}`, category: 'Test', unitPrice: 1000, costPrice: 800 }).returning()
  extraProductIds.push(product.id)
  await db.insert(stockLevels).values({ productId: product.id, storeId, quantity: 0 })
  return product.id
}

beforeAll(async () => {
  const [store] = await db.insert(stores).values({ name: `Magasin ${runId}`, city: 'Test' }).returning()
  storeId = store.id
  const [supplier] = await db.insert(suppliers).values({ name: `Fournisseur ${runId}` }).returning()
  supplierId = supplier.id
  const [product] = await db.insert(products).values({ name: `Produit ${runId}`, sku: `SKU-SUP-${runId}`, category: 'Test', unitPrice: 1000, costPrice: 800 }).returning()
  productId = product.id
  await db.insert(stockLevels).values({ productId, storeId, quantity: 0 })
})

afterAll(async () => {
  for (const id of deliveryIds) {
    await db.delete(auditLog).where(and(eq(auditLog.entityType, 'supplier_delivery'), eq(auditLog.entityId, id)))
  }
  for (const saleId of saleIds) {
    await db.delete(saleItems).where(eq(saleItems.saleId, saleId))
    await db.delete(sales).where(eq(sales.id, saleId))
  }
  await db.delete(supplierPayables).where(eq(supplierPayables.supplierId, supplierId))
  await db.delete(supplierDeliveries).where(eq(supplierDeliveries.supplierId, supplierId))
  await db.delete(stockLevels).where(eq(stockLevels.storeId, storeId))
  await db.delete(products).where(eq(products.id, productId))
  for (const id of extraProductIds) {
    await db.delete(stockLevels).where(eq(stockLevels.productId, id))
    await db.delete(products).where(eq(products.id, id))
  }
  await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  await db.delete(stores).where(eq(stores.id, storeId))
})

describe('updateSupplierDelivery', () => {
  it('correcting the sack count adjusts stock by the delta', async () => {
    const before = await stockOf()
    const delivery = await recordSupplierDelivery({ supplierId, storeId, productId, sackCount: 10, paymentStatus: 'paid', paidNow: 0, dueInDays: 30 })
    deliveryIds.push(delivery.id)
    expect(await stockOf()).toBe(before + 10)

    const updated = await updateSupplierDelivery(delivery.id, { sackCount: 15, paymentStatus: 'paid', paidNow: 0, dueInDays: 30 }, testActor, 'quantité corrigée')

    expect(updated.sackCount).toBe(15)
    expect(await stockOf()).toBe(before + 15)

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'supplier_delivery'), eq(auditLog.entityId, delivery.id), eq(auditLog.action, 'update')))
    expect(entry.reason).toBe('quantité corrigée')
  })

  it('switching from credit to paid removes the supplier payable it had created', async () => {
    const delivery = await recordSupplierDelivery({ supplierId, storeId, productId, sackCount: 5, paymentStatus: 'credit', paidNow: 0, dueInDays: 30 })
    deliveryIds.push(delivery.id)
    const [payableBefore] = await db.select().from(supplierPayables).where(eq(supplierPayables.deliveryId, delivery.id))
    expect(payableBefore).toBeDefined()

    await updateSupplierDelivery(delivery.id, { sackCount: 5, paymentStatus: 'paid', paidNow: 0, dueInDays: 30 }, testActor)

    const [payableAfter] = await db.select().from(supplierPayables).where(eq(supplierPayables.deliveryId, delivery.id))
    expect(payableAfter).toBeUndefined()
  })

  it('rejects reducing the sack count below what has already been sold', async () => {
    const isolatedProductId = await isolatedProduct()
    const delivery = await recordSupplierDelivery({ supplierId, storeId, productId: isolatedProductId, sackCount: 10, paymentStatus: 'paid', paidNow: 0, dueInDays: 30 })
    deliveryIds.push(delivery.id)

    const sale = await createSale({ storeId, clientId: null, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId: isolatedProductId, quantity: 8 }] })
    saleIds.push(sale.id)
    // Stock is now 2 (10 received - 8 sold) — reversing this delivery needs 10 available.

    await expect(
      updateSupplierDelivery(delivery.id, { sackCount: 3, paymentStatus: 'paid', paidNow: 0, dueInDays: 30 }, testActor),
    ).rejects.toThrow(/stock insuffisant/i)
  })

  it('rejects editing a delivery that does not exist', async () => {
    await expect(
      updateSupplierDelivery(999_999_999, { sackCount: 1, paymentStatus: 'paid', paidNow: 0, dueInDays: 30 }, testActor),
    ).rejects.toThrow(/introuvable/i)
  })
})

describe('deleteSupplierDelivery', () => {
  it('restores stock, removes the payable, and soft-deletes the delivery', async () => {
    const before = await stockOf()
    const delivery = await recordSupplierDelivery({ supplierId, storeId, productId, sackCount: 7, paymentStatus: 'credit', paidNow: 0, dueInDays: 30 })
    deliveryIds.push(delivery.id)
    expect(await stockOf()).toBe(before + 7)

    await deleteSupplierDelivery(delivery.id, testActor, 'livraison fictive')

    expect(await stockOf()).toBe(before)
    const [payable] = await db.select().from(supplierPayables).where(eq(supplierPayables.deliveryId, delivery.id))
    expect(payable).toBeUndefined()
    const [row] = await db.select().from(supplierDeliveries).where(eq(supplierDeliveries.id, delivery.id))
    expect(row.deletedAt).not.toBeNull()

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'supplier_delivery'), eq(auditLog.entityId, delivery.id), eq(auditLog.action, 'delete')))
    expect(entry.reason).toBe('livraison fictive')
  })

  it('rejects deleting a delivery whose stock has already been partly sold', async () => {
    const isolatedProductId = await isolatedProduct()
    const delivery = await recordSupplierDelivery({ supplierId, storeId, productId: isolatedProductId, sackCount: 6, paymentStatus: 'paid', paidNow: 0, dueInDays: 30 })
    deliveryIds.push(delivery.id)

    const sale = await createSale({ storeId, clientId: null, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId: isolatedProductId, quantity: 4 }] })
    saleIds.push(sale.id)

    await expect(deleteSupplierDelivery(delivery.id, testActor)).rejects.toThrow(/stock insuffisant/i)
  })

  it('rejects deleting a delivery that does not exist', async () => {
    await expect(deleteSupplierDelivery(999_999_999, testActor)).rejects.toThrow(/introuvable/i)
  })
})
