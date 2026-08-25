import { and, asc, eq, ne } from 'drizzle-orm'
import { db } from '../client'
import { payments, paymentMethod, receivables, supplierPayables, supplierPayments } from '../schema'

export async function recordPayment(input: { clientId: number; amount: number; method: (typeof paymentMethod)[number]; storeId: number }) {
  await db.insert(payments).values({
    clientId: input.clientId,
    saleId: null,
    storeId: input.storeId,
    amount: input.amount,
    method: input.method,
  })

  let remaining = input.amount
  const openReceivables = await db
    .select()
    .from(receivables)
    .where(and(eq(receivables.clientId, input.clientId), ne(receivables.status, 'paid')))
    .orderBy(asc(receivables.dueDate))

  for (const receivable of openReceivables) {
    if (remaining <= 0) break
    if (remaining >= receivable.amount) {
      remaining -= receivable.amount
      await db.update(receivables).set({ amount: 0, status: 'paid' }).where(eq(receivables.id, receivable.id))
    } else {
      await db.update(receivables).set({ amount: receivable.amount - remaining }).where(eq(receivables.id, receivable.id))
      remaining = 0
    }
  }
}

export async function recordSupplierPayment(input: { supplierId: number; amount: number; method: (typeof paymentMethod)[number] }) {
  await db.insert(supplierPayments).values({
    supplierId: input.supplierId,
    amount: input.amount,
    method: input.method,
  })

  let remaining = input.amount
  const openPayables = await db
    .select()
    .from(supplierPayables)
    .where(and(eq(supplierPayables.supplierId, input.supplierId), ne(supplierPayables.status, 'paid')))
    .orderBy(asc(supplierPayables.dueDate))

  for (const payable of openPayables) {
    if (remaining <= 0) break
    if (remaining >= payable.amount) {
      remaining -= payable.amount
      await db.update(supplierPayables).set({ amount: 0, status: 'paid' }).where(eq(supplierPayables.id, payable.id))
    } else {
      await db.update(supplierPayables).set({ amount: payable.amount - remaining }).where(eq(supplierPayables.id, payable.id))
      remaining = 0
    }
  }
}
