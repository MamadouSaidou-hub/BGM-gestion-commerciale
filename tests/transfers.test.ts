import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { products, stockLevels, stockMovements, stores, transferItems, transfers } from '@/lib/db/schema'
import { createTransfer, receiveTransfer } from '@/lib/db/mutations/transfers'

const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

let fromStoreId: number
let toStoreId: number
let productId: number
const transferIds: number[] = []

async function stockOf(storeId: number) {
  const [row] = await db.select({ quantity: stockLevels.quantity }).from(stockLevels).where(and(eq(stockLevels.productId, productId), eq(stockLevels.storeId, storeId)))
  return row?.quantity ?? 0
}

beforeAll(async () => {
  const [fromStore] = await db.insert(stores).values({ name: `Magasin origine ${runId}`, city: 'Test' }).returning()
  fromStoreId = fromStore.id
  const [toStore] = await db.insert(stores).values({ name: `Magasin destination ${runId}`, city: 'Test' }).returning()
  toStoreId = toStore.id

  const [product] = await db
    .insert(products)
    .values({ name: `Farine ${runId}`, sku: `SKU-${runId}`, category: 'Test', unitPrice: 1000, costPrice: 800 })
    .returning()
  productId = product.id

  await db.insert(stockLevels).values({ productId, storeId: fromStoreId, quantity: 100 })
})

afterAll(async () => {
  await db.delete(stockMovements).where(eq(stockMovements.productId, productId))
  for (const transferId of transferIds) {
    await db.delete(transferItems).where(eq(transferItems.transferId, transferId))
    await db.delete(transfers).where(eq(transfers.id, transferId))
  }
  await db.delete(stockLevels).where(eq(stockLevels.productId, productId))
  await db.delete(products).where(eq(products.id, productId))
  await db.delete(stores).where(eq(stores.id, fromStoreId))
  await db.delete(stores).where(eq(stores.id, toStoreId))
})

describe('createTransfer', () => {
  it('decrements only the origin store', async () => {
    const transfer = await createTransfer({ fromStoreId, toStoreId, items: [{ productId, quantity: 30 }] })
    transferIds.push(transfer.id)

    expect(await stockOf(fromStoreId)).toBe(70)
    expect(await stockOf(toStoreId)).toBe(0)
    expect(transfer.status).toBe('in_transit')
  })
})

describe('receiveTransfer', () => {
  it('increments the destination store and marks the transfer completed', async () => {
    const transfer = await createTransfer({ fromStoreId, toStoreId, items: [{ productId, quantity: 20 }] })
    transferIds.push(transfer.id)

    const updated = await receiveTransfer(transfer.id)
    expect(updated.status).toBe('completed')
    expect(await stockOf(toStoreId)).toBe(20)
  })

  it('rejects receiving the same transfer twice', async () => {
    const transfer = await createTransfer({ fromStoreId, toStoreId, items: [{ productId, quantity: 5 }] })
    transferIds.push(transfer.id)

    await receiveTransfer(transfer.id)
    await expect(receiveTransfer(transfer.id)).rejects.toThrow(/déjà été marqué/i)
  })
})
