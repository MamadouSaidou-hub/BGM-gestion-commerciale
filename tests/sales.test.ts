import { and, desc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { auditLog, cashAccounts, cashMovements, clients, payments, products, receivables, saleItems, sales, stockLevels, stockMovements, stores } from '@/lib/db/schema'
import { cancelSale, createSale, updateSale } from '@/lib/db/mutations/sales'
import { createCashAccount, setDefaultCashAccount } from '@/lib/db/mutations/cash-accounts'

const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const testActor = { userId: `test-actor-${runId}`, userName: 'Test Suite' }

let storeId: number
let clientId: number
let sackProductId: number
let tonneProductId: number
let cashAccountId: number
let previousDefaultAccountId: number | null
const saleIds: number[] = []

async function stockOf(productId: number) {
  const [row] = await db.select({ quantity: stockLevels.quantity }).from(stockLevels).where(and(eq(stockLevels.productId, productId), eq(stockLevels.storeId, storeId)))
  return row?.quantity ?? 0
}

async function cancellationMovementFor(reference: string) {
  const [row] = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.description, `Annulation vente #${reference}`))
    .orderBy(desc(cashMovements.createdAt))
  return row ?? null
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

  // createSale/cancelSale auto-route cash through whichever account is marked default — point it
  // at a dedicated test account so assertions on cash movements aren't at the mercy of whatever
  // real caisse already exists, then restore the previous default afterward.
  const [existingDefault] = await db.select().from(cashAccounts).where(eq(cashAccounts.isDefault, true))
  previousDefaultAccountId = existingDefault?.id ?? null
  const account = await createCashAccount({ name: `Caisse ${runId}`, type: 'cash', initialBalance: 0 })
  cashAccountId = account.id
  await setDefaultCashAccount(cashAccountId)
})

afterAll(async () => {
  for (const saleId of saleIds) {
    await db.delete(auditLog).where(and(eq(auditLog.entityType, 'sale'), eq(auditLog.entityId, saleId)))
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

  if (previousDefaultAccountId) await setDefaultCashAccount(previousDefaultAccountId)
  await db.delete(cashMovements).where(eq(cashMovements.cashAccountId, cashAccountId))
  await db.delete(cashAccounts).where(eq(cashAccounts.id, cashAccountId))
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
      items: [{ productId: sackProductId, quantity: 10 }],
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
      items: [{ productId: sackProductId, quantity: 10 }], // total = 10,000
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
        items: [{ productId: sackProductId, quantity: before + 1000 }],
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
      items: [{ productId: tonneProductId, quantity: 0, unit: 'tonne', tonnage: 2.5 }], // 2.5t / 25kg = 100 sacks
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
        items: [{ productId: sackProductId, quantity: 0, unit: 'tonne', tonnage: 1 }],
      }),
    ).rejects.toThrow(/poids de sac/i)
  })
})

describe('cancelSale', () => {
  it('restores stock, reverses the caisse deposit, and deletes a walk-in (no client) cash sale', async () => {
    const before = await stockOf(sackProductId)
    const sale = await createSale({
      storeId,
      clientId: null,
      paymentStatus: 'paid',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 5 }], // total = 5,000
    })
    saleIds.push(sale.id)
    expect(await stockOf(sackProductId)).toBe(before - 5)

    await cancelSale(sale.reference, testActor)

    expect(await stockOf(sackProductId)).toBe(before)
    const [remainingSale] = await db.select().from(sales).where(eq(sales.id, sale.id))
    expect(remainingSale).toBeDefined()
    expect(remainingSale.deletedAt).not.toBeNull()

    const reversal = await cancellationMovementFor(sale.reference)
    expect(reversal?.type).toBe('expense')
    expect(reversal?.amount).toBe(5000)
  })

  it('removes the payment and receivable of a partial credit sale, and reverses only the amount actually paid', async () => {
    const sale = await createSale({
      storeId,
      clientId,
      paymentStatus: 'partial',
      paidNow: 4000,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 10 }], // total = 10,000
    })
    saleIds.push(sale.id)

    await cancelSale(sale.reference, testActor)

    const [remainingPayment] = await db.select().from(payments).where(eq(payments.saleId, sale.id))
    expect(remainingPayment).toBeUndefined()
    const [remainingReceivable] = await db.select().from(receivables).where(eq(receivables.saleId, sale.id))
    expect(remainingReceivable).toBeUndefined()

    const reversal = await cancellationMovementFor(sale.reference)
    expect(reversal?.amount).toBe(4000)
  })

  it('restores a tonne-unit sale back to the correct sack count', async () => {
    // Earlier tests in this file (createSale's own tonne test) may have already drawn down
    // tonneProductId's stock without cancelling — top it back up so this test's own math holds
    // regardless of what ran before it.
    await db.update(stockLevels).set({ quantity: 100 }).where(and(eq(stockLevels.productId, tonneProductId), eq(stockLevels.storeId, storeId)))
    const before = await stockOf(tonneProductId)
    const sale = await createSale({
      storeId,
      clientId: null,
      paymentStatus: 'paid',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: tonneProductId, quantity: 0, unit: 'tonne', tonnage: 2.5 }], // 100 sacks
    })
    saleIds.push(sale.id)
    expect(await stockOf(tonneProductId)).toBe(before - 100)

    await cancelSale(sale.reference, testActor)

    expect(await stockOf(tonneProductId)).toBe(before)
  })

  it('rejects cancelling a reference that does not exist', async () => {
    await expect(cancelSale(`BG-NOPE-${runId}`, testActor)).rejects.toThrow(/introuvable/i)
  })
})

describe('updateSale', () => {
  it('correcting the quantity recomputes the total and adjusts stock by the delta', async () => {
    const before = await stockOf(sackProductId)
    const sale = await createSale({
      storeId,
      clientId: null,
      paymentStatus: 'paid',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 5 }], // total = 5,000
    })
    saleIds.push(sale.id)
    expect(await stockOf(sackProductId)).toBe(before - 5)

    const updated = await updateSale(
      sale.reference,
      { clientId: null, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId: sackProductId, quantity: 8 }] }, // total = 8,000
      testActor,
    )

    expect(updated.totalAmount).toBe(8_000)
    expect(await stockOf(sackProductId)).toBe(before - 8)
    const [row] = await db.select().from(saleItems).where(eq(saleItems.saleId, sale.id))
    expect(row.quantity).toBe(8)
  })

  it('switching a credit sale to fully paid removes its receivable and records the cash received', async () => {
    const sale = await createSale({
      storeId,
      clientId,
      paymentStatus: 'credit',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 6 }], // total = 6,000
    })
    saleIds.push(sale.id)
    const [receivableBefore] = await db.select().from(receivables).where(eq(receivables.saleId, sale.id))
    expect(receivableBefore).toBeDefined()

    await updateSale(
      sale.reference,
      { clientId, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId: sackProductId, quantity: 6 }] },
      testActor,
    )

    const [receivableAfter] = await db.select().from(receivables).where(eq(receivables.saleId, sale.id))
    expect(receivableAfter).toBeUndefined()
    const [paymentAfter] = await db.select().from(payments).where(eq(payments.saleId, sale.id))
    expect(paymentAfter?.amount).toBe(6_000)
  })

  it('writes an audit log row with the actor and a before/after snapshot', async () => {
    const sale = await createSale({
      storeId,
      clientId: null,
      paymentStatus: 'paid',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 2 }],
    })
    saleIds.push(sale.id)

    await updateSale(
      sale.reference,
      { clientId: null, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId: sackProductId, quantity: 3 }] },
      testActor,
      'quantité corrigée',
    )

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'sale'), eq(auditLog.entityId, sale.id), eq(auditLog.action, 'update')))
    expect(entry.actorId).toBe(testActor.userId)
    expect(entry.reason).toBe('quantité corrigée')
    expect((entry.beforeData as { sale: { totalAmount: number } }).sale.totalAmount).toBe(2_000)
    expect((entry.afterData as { sale: { totalAmount: number } }).sale.totalAmount).toBe(3_000)
  })

  it('rejects editing a reference that does not exist', async () => {
    await expect(
      updateSale(`BG-NOPE-${runId}`, { clientId: null, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId: sackProductId, quantity: 1 }] }, testActor),
    ).rejects.toThrow(/introuvable/i)
  })

  it('rejects editing an already-cancelled sale', async () => {
    const sale = await createSale({
      storeId,
      clientId: null,
      paymentStatus: 'paid',
      paidNow: 0,
      dueInDays: 15,
      items: [{ productId: sackProductId, quantity: 1 }],
    })
    saleIds.push(sale.id)
    await cancelSale(sale.reference, testActor)

    await expect(
      updateSale(sale.reference, { clientId: null, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId: sackProductId, quantity: 1 }] }, testActor),
    ).rejects.toThrow(/introuvable/i)
  })
})
