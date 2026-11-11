import { and, desc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { auditLog, cashAccounts, cashMovements, clients, payments, products, receivables, saleItems, sales, stockLevels, stores, suppliers } from '@/lib/db/schema'
import { recordPayment, updatePayment, deletePayment, recordSupplierPayment, updateSupplierPayment, deleteSupplierPayment } from '@/lib/db/mutations/payments'
import { createSale } from '@/lib/db/mutations/sales'
import { createCashAccount, setDefaultCashAccount } from '@/lib/db/mutations/cash-accounts'

const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const testActor = { userId: `test-actor-${runId}`, userName: 'Test Suite' }

let storeId: number
let clientId: number
let supplierId: number
let productId: number
let cashAccountId: number
let previousDefaultAccountId: number | null
const paymentIds: number[] = []
const supplierPaymentIds: number[] = []
const saleIds: number[] = []

async function balanceOf() {
  const [row] = await db.select({ balance: cashAccounts.balance }).from(cashAccounts).where(eq(cashAccounts.id, cashAccountId))
  return row?.balance ?? 0
}

async function cashMovementFor(description: string) {
  const [row] = await db.select().from(cashMovements).where(eq(cashMovements.description, description)).orderBy(desc(cashMovements.createdAt))
  return row ?? null
}

beforeAll(async () => {
  const [store] = await db.insert(stores).values({ name: `Magasin ${runId}`, city: 'Test' }).returning()
  storeId = store.id
  const [client] = await db.insert(clients).values({ name: `Client ${runId}`, storeId }).returning()
  clientId = client.id
  const [supplier] = await db.insert(suppliers).values({ name: `Fournisseur ${runId}` }).returning()
  supplierId = supplier.id
  const [product] = await db.insert(products).values({ name: `Produit ${runId}`, sku: `SKU-PAY-${runId}`, category: 'Test', unitPrice: 1000, costPrice: 800 }).returning()
  productId = product.id
  await db.insert(stockLevels).values({ productId, storeId, quantity: 100 })

  // recordPayment/recordSupplierPayment auto-route cash through whichever account is marked
  // default — point it at a dedicated test account first, same convention as sales.test.ts.
  const [existingDefault] = await db.select().from(cashAccounts).where(eq(cashAccounts.isDefault, true))
  previousDefaultAccountId = existingDefault?.id ?? null
  const account = await createCashAccount({ name: `Caisse ${runId}`, type: 'cash', initialBalance: 0 })
  cashAccountId = account.id
  await setDefaultCashAccount(cashAccountId)
})

afterAll(async () => {
  for (const id of paymentIds) {
    await db.delete(auditLog).where(and(eq(auditLog.entityType, 'payment'), eq(auditLog.entityId, id)))
  }
  for (const id of supplierPaymentIds) {
    await db.delete(auditLog).where(and(eq(auditLog.entityType, 'supplier_payment'), eq(auditLog.entityId, id)))
  }
  for (const saleId of saleIds) {
    await db.delete(receivables).where(eq(receivables.saleId, saleId))
    await db.delete(payments).where(eq(payments.saleId, saleId))
    await db.delete(saleItems).where(eq(saleItems.saleId, saleId))
    await db.delete(sales).where(eq(sales.id, saleId))
  }
  await db.delete(cashMovements).where(eq(cashMovements.cashAccountId, cashAccountId))
  await db.delete(stockLevels).where(eq(stockLevels.storeId, storeId))
  await db.delete(products).where(eq(products.id, productId))
  await db.delete(clients).where(eq(clients.id, clientId))
  await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  await db.delete(stores).where(eq(stores.id, storeId))

  if (previousDefaultAccountId) await setDefaultCashAccount(previousDefaultAccountId)
  await db.delete(cashAccounts).where(eq(cashAccounts.id, cashAccountId))
})

describe('recordPayment', () => {
  it('records a payment with a cash movement uniquely tied to it by id', async () => {
    const payment = await recordPayment({ clientId, amount: 5_000, method: 'cash', storeId })
    paymentIds.push(payment.id)

    const movement = await cashMovementFor(`Paiement #${payment.id}`)
    expect(movement?.amount).toBe(5_000)
    expect(await balanceOf()).toBe(5_000)
  })
})

describe('updatePayment', () => {
  it('reverses the old amount and applies the corrected one', async () => {
    const payment = await recordPayment({ clientId, amount: 3_000, method: 'cash', storeId })
    paymentIds.push(payment.id)
    const balanceBefore = await balanceOf()

    const updated = await updatePayment(payment.id, { amount: 7_000, method: 'bank_transfer' }, testActor, 'montant corrigé')

    expect(updated.amount).toBe(7_000)
    expect(updated.method).toBe('bank_transfer')
    expect(await balanceOf()).toBe(balanceBefore - 3_000 + 7_000)

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'payment'), eq(auditLog.entityId, payment.id), eq(auditLog.action, 'update')))
    expect(entry.actorId).toBe(testActor.userId)
    expect(entry.reason).toBe('montant corrigé')
  })

  it('rejects editing a payment that does not exist', async () => {
    await expect(updatePayment(999_999_999, { amount: 1_000, method: 'cash' }, testActor)).rejects.toThrow(/introuvable/i)
  })

  it('rejects editing a payment created alongside a sale', async () => {
    const sale = await createSale({ storeId, clientId, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId, quantity: 1 }] })
    saleIds.push(sale.id)
    const [linkedPayment] = await db.select().from(payments).where(eq(payments.saleId, sale.id))

    await expect(updatePayment(linkedPayment.id, { amount: 500, method: 'cash' }, testActor)).rejects.toThrow(/lié à une vente/i)
  })
})

describe('deletePayment', () => {
  it('reverses the cash movement, soft-deletes, and does not reopen a receivable the payment already settled', async () => {
    const creditSale = await createSale({ storeId, clientId, paymentStatus: 'credit', paidNow: 0, dueInDays: 15, items: [{ productId, quantity: 1 }] })
    saleIds.push(creditSale.id)

    // recordPayment's own FIFO logic settles this receivable immediately — capture its state
    // *after* that happens, since that's the baseline deletePayment must not disturb (it must not
    // reopen a debt that recording the payment already legitimately closed).
    const payment = await recordPayment({ clientId, amount: 2_000, method: 'cash', storeId })
    paymentIds.push(payment.id)
    const [receivableBefore] = await db.select().from(receivables).where(eq(receivables.saleId, creditSale.id))
    expect(receivableBefore.status).toBe('paid')
    const balanceBefore = await balanceOf()

    await deletePayment(payment.id, testActor, 'doublon')

    expect(await balanceOf()).toBe(balanceBefore - 2_000)
    const [receivableAfter] = await db.select().from(receivables).where(eq(receivables.saleId, creditSale.id))
    expect(receivableAfter.amount).toBe(receivableBefore.amount)
    expect(receivableAfter.status).toBe(receivableBefore.status)

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'payment'), eq(auditLog.entityId, payment.id), eq(auditLog.action, 'delete')))
    expect(entry.reason).toBe('doublon')
  })

  it('rejects deleting a payment created alongside a sale', async () => {
    const sale = await createSale({ storeId, clientId, paymentStatus: 'paid', paidNow: 0, dueInDays: 15, items: [{ productId, quantity: 1 }] })
    saleIds.push(sale.id)
    const [linkedPayment] = await db.select().from(payments).where(eq(payments.saleId, sale.id))

    await expect(deletePayment(linkedPayment.id, testActor)).rejects.toThrow(/lié à une vente/i)
  })
})

describe('recordSupplierPayment / updateSupplierPayment / deleteSupplierPayment', () => {
  it('records, corrects, and deletes a supplier payment symmetrically on the cash balance', async () => {
    const payment = await recordSupplierPayment({ supplierId, amount: 4_000, method: 'bank_transfer' })
    supplierPaymentIds.push(payment.id)
    const afterRecord = await balanceOf()

    const updated = await updateSupplierPayment(payment.id, { amount: 6_000, method: 'check' }, testActor)
    expect(updated.amount).toBe(6_000)
    expect(await balanceOf()).toBe(afterRecord + 4_000 - 6_000)

    const beforeDelete = await balanceOf()
    await deleteSupplierPayment(payment.id, testActor, 'doublon fournisseur')
    expect(await balanceOf()).toBe(beforeDelete + 6_000)

    const [deleteEntry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'supplier_payment'), eq(auditLog.entityId, payment.id), eq(auditLog.action, 'delete')))
    expect(deleteEntry.reason).toBe('doublon fournisseur')
  })

  it('rejects editing/deleting a supplier payment that does not exist', async () => {
    await expect(updateSupplierPayment(999_999_999, { amount: 1_000, method: 'cash' }, testActor)).rejects.toThrow(/introuvable/i)
    await expect(deleteSupplierPayment(999_999_999, testActor)).rejects.toThrow(/introuvable/i)
  })
})
