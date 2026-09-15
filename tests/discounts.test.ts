import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { discountApplications, discountScales, discountTiers, products, stores, supplierDeliveries, suppliers } from '@/lib/db/schema'
import { checkAndGrantSupplierCycle, getSupplierCycleProgress, setDiscountTiers } from '@/lib/db/mutations/discounts'

// Integration test — runs against the real Supabase Postgres DB (no separate test DB available on the
// free tier). Every fixture is suffixed with a unique run id and cleaned up in afterAll by id, so it
// never touches or depends on any other row in the shared tables.
const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

let supplierId: number
let storeId: number
let productId: number

async function deliver(sackCount: number) {
  await db.insert(supplierDeliveries).values({
    supplierId,
    storeId,
    productId,
    sackCount,
    totalAmount: 0,
  })
}

beforeAll(async () => {
  const [supplier] = await db.insert(suppliers).values({ name: `Fournisseur ${runId}` }).returning()
  supplierId = supplier.id
  const [store] = await db.insert(stores).values({ name: `Magasin ${runId}`, city: 'Test' }).returning()
  storeId = store.id
  const [product] = await db
    .insert(products)
    .values({ name: `Produit ${runId}`, sku: `SKU-${runId}`, category: 'Test', unitPrice: 100, costPrice: 80 })
    .returning()
  productId = product.id
  // Two tiers: crossing either grants a discount on the FULL accumulated sack count (cliff), and the
  // highest tier reached wins when both are crossed at once.
  await setDiscountTiers('supplier', supplierId, [
    { thresholdSacks: 1000, discountPerSack: 2000 },
    { thresholdSacks: 2000, discountPerSack: 5000 },
  ])
})

afterAll(async () => {
  const [scale] = await db
    .select()
    .from(discountScales)
    .where(and(eq(discountScales.partyType, 'supplier'), eq(discountScales.partyId, supplierId)))
  if (scale) {
    await db.delete(discountApplications).where(eq(discountApplications.scaleId, scale.id))
    await db.delete(discountTiers).where(eq(discountTiers.scaleId, scale.id))
    await db.delete(discountScales).where(eq(discountScales.id, scale.id))
  }
  await db.delete(supplierDeliveries).where(eq(supplierDeliveries.supplierId, supplierId))
  await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  await db.delete(products).where(eq(products.id, productId))
  await db.delete(stores).where(eq(stores.id, storeId))
})

describe('supplier discount cycle', () => {
  it('grants nothing before the first tier is reached', async () => {
    await deliver(500)
    const grant = await checkAndGrantSupplierCycle(supplierId)
    expect(grant).toBeNull()

    const progress = await getSupplierCycleProgress(supplierId)
    expect(progress.sackCount).toBe(500)
    expect(progress.nextTier).toEqual({ thresholdSacks: 1000, sacksRemaining: 500 })
  })

  it('grants a cliff discount on the full accumulated count once a tier is crossed, then resets the cycle', async () => {
    await deliver(600) // 500 + 600 = 1100, crosses the 1000-sack tier

    const grant = await checkAndGrantSupplierCycle(supplierId)
    expect(grant).not.toBeNull()
    expect(grant?.tierReached).toBe(1000)
    expect(grant?.sackCount).toBe(1100)
    expect(grant?.discountPerSack).toBe(2000)
    expect(grant?.totalDiscount).toBe(1100 * 2000)

    const progress = await getSupplierCycleProgress(supplierId)
    expect(progress.sackCount).toBe(0)
  })

  it('starts counting from zero after a grant and reaches the highest tier on the full new total', async () => {
    await deliver(2000)

    const grant = await checkAndGrantSupplierCycle(supplierId)
    expect(grant).not.toBeNull()
    expect(grant?.tierReached).toBe(2000)
    expect(grant?.sackCount).toBe(2000)
    expect(grant?.discountPerSack).toBe(5000)
    expect(grant?.totalDiscount).toBe(2000 * 5000)
  })
})
