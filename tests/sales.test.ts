import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { clients, payments, products, receivables, saleItems, sales, stockLevels, stockMovements, stores } from '@/lib/db/schema'
import { createSale } from '@/lib/db/mutations/sales'

const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

let storeId: number
let clientId: number
let sackProductId: number
let tonneProductId: number
const saleIds: number[] = []

async function stockOf(productId: number) {
  const [row] = await db.select({ quantity: stockLevels.quantity }).from(stockLevels).where(and(eq(stockLevels.productId, productId), eq(stockLevels.storeId, storeId)))
  return row?.quantity ?? 0
}

beforeAll(async () => {
  const [store] = await db.insert(stores).values({ name: `Magasin ${runId}`, city: 'Test' }).returning()
  storeId = store.id
  const [client] = await db.insert(clients).values({ name: `Client ${runId}`, storeId }).returning()
  clientId = client.id

  const [sackProduct] = await db
    .insert(products)
    .values({ name: `Farine sac ${runId}`, sku: `SKU-SACK-${runId}`, category: 'Test', unitPrice: 1000, costPrice: 800 })
    .returning()
  sackProductId = sackProduct.id

  const [tonneProduct] = await db
    .insert(products)
    .values({ name: `Farine tonne ${runId}`, sku: `SKU-TONNE-${runId}`, category: 'Test', unitPrice: 1000, costPrice: 800, sackWeightKg: 25 })
    .returning()
  tonneProductId = tonneProduct.id

  await db.insert(stockLevels).values([
    { productId: sackProductId, storeId, quantity: 100 },
    { productId: tonneProductId, storeId, quantity: 100 },
  ])
})

afterAll(async () => {
  for (const saleId of saleIds) {
    await db.delete(receivables).where(eq(receivables.saleId, saleId))
    await db.delete(payments).where(eq(payments.saleId, saleId))
    await db.delete(saleItems).where(eq(saleItems.saleId, saleId))
    await db.delete(sales).where(eq(sales.id, saleId))
  }
  await db.delete(stockMovements).where(eq(stockMovements.storeId, storeId))
  await db.delete(stockLevels).where(eq(stockLevels.storeId, storeId))
  await db.delete(products).where(eq(products.id, sackProductId))
  await db.delete(products).where(eq(products.id, tonneProductId))
  await db.delete(clients).where(eq(clients.id, clientId))
  await db.delete(stores).where(eq(stores.id, storeId))
})

describe('createSale', () => {
  it('deducts stock for a paid sale', async () => {
    const before = await stockOf(sackProductId)
    const sale = await createSale({
      storeId,
      clientId: null,
      paymentStatus: 'paid',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 10, unitPrice: 1000 }],
    })
    saleIds.push(sale.id)
    expect(await stockOf(sackProductId)).toBe(before - 10)
  })

  it('records both a payment and the correct receivable remainder for a partial sale', async () => {
    const sale = await createSale({
      storeId,
      clientId,
      paymentStatus: 'partial',
      paidNow: 4000,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 10, unitPrice: 1000 }], // total = 10,000
    })
    saleIds.push(sale.id)

    const [payment] = await db.select().from(payments).where(eq(payments.saleId, sale.id))
    expect(payment?.amount).toBe(4000)

    const [receivable] = await db.select().from(receivables).where(eq(receivables.saleId, sale.id))
    expect(receivable?.amount).toBe(6000)
  })

  it('rejects a sale when stock is insufficient and leaves stock unchanged', async () => {
    const before = await stockOf(sackProductId)
    await expect(
      createSale({
        storeId,
        clientId: null,
        paymentStatus: 'paid',
        paidNow: 0,
        dueInDays: 15,
        items: [{ productId: sackProductId, quantity: before + 1000, unitPrice: 1000 }],
      }),
    ).rejects.toThrow(/stock insuffisant/i)
    expect(await stockOf(sackProductId)).toBe(before)
  })

  it('converts a tonne-unit sale to the correct sack count', async () => {
    const before = await stockOf(tonneProductId)
    const sale = await createSale({
      storeId,
      clientId: null,
      paymentStatus: 'paid',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: tonneProductId, quantity: 0, unitPrice: 1000, unit: 'tonne', tonnage: 2.5 }], // 2.5t / 25kg = 100 sacks
    })
    saleIds.push(sale.id)

    const [item] = await db.select().from(saleItems).where(eq(saleItems.saleId, sale.id))
    expect(item.quantity).toBe(100)
    expect(item.unit).toBe('tonne')
    expect(item.tonnage).toBe(2.5)
    expect(await stockOf(tonneProductId)).toBe(before - 100)
  })

  it('rejects a tonne-unit sale for a product with no configured sack weight', async () => {
    await expect(
      createSale({
        storeId,
        clientId: null,
        paymentStatus: 'paid',
        paidNow: 0,
        dueInDays: 15,
        items: [{ productId: sackProductId, quantity: 0, unitPrice: 1000, unit: 'tonne', tonnage: 1 }],
      }),
    ).rejects.toThrow(/poids de sac/i)
  })
})
