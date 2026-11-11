import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../client'
import { auditLog, payments, paymentMethod, receivables, supplierPayables, supplierPayments } from '../schema'
import { recordAutoCashMovement } from './cash-accounts'

type Actor = { userId: string; userName: string }

export async function recordPayment(input: { clientId: number; amount: number; method: (typeof paymentMethod)[number]; storeId: number }) {
  const [payment] = await db
    .insert(payments)
    .values({
      clientId: input.clientId,
      saleId: null,
      storeId: input.storeId,
      amount: input.amount,
      method: input.method,
    })
    .returning()

  // Named after the payment's own id purely for readability in the caisse ledger — reversal
  // (updatePayment/deletePayment) reads the amount straight off this `payments` row, not by
  // searching for this description, so it stays correct even after the payment is edited.
  await recordAutoCashMovement({
    direction: 'in',
    amount: input.amount,
    storeId: input.storeId,
    category: 'Encaissement client',
    description: `Paiement #${payment.id}`,
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

  return payment
}

export async function recordSupplierPayment(input: { supplierId: number; amount: number; method: (typeof paymentMethod)[number] }) {
  const [payment] = await db
    .insert(supplierPayments)
    .values({
      supplierId: input.supplierId,
      amount: input.amount,
      method: input.method,
    })
    .returning()

  // Suppliers aren't store-scoped, so this resolves to the default cash account regardless.
  await recordAutoCashMovement({
    direction: 'out',
    amount: input.amount,
    category: 'Paiement fournisseur',
    description: `Paiement fournisseur #${payment.id}`,
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

  return payment
}

/**
 * Corrects a client payment entered by mistake (wrong amount/method) — reverses the amount it
 * currently holds (whatever `payments.amount` says right now, not whatever the original cash
 * movement said — important if this payment was already edited once before) and records the
 * corrected one. Deliberately does NOT touch `receivables`: which debt(s) this payment settled
 * isn't tracked (see recordPayment's FIFO loop — no link is kept between a payment and the
 * receivables it closed), so re-deriving that on an edit would risk reopening the wrong client's
 * or sale's debt. The admin is expected to check receivables manually if the corrected amount
 * materially changes what should be owed.
 */
export async function updatePayment(
  id: number,
  input: { amount: number; method: (typeof paymentMethod)[number] },
  actor: Actor,
  reason?: string,
) {
  if (input.amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.')
  }

  const [existing] = await db.select().from(payments).where(and(eq(payments.id, id), isNull(payments.deletedAt)))
  if (!existing) {
    throw new Error('Paiement introuvable.')
  }
  if (existing.saleId !== null) {
    throw new Error('Ce paiement est lié à une vente — modifiez la vente directement.')
  }

  await recordAutoCashMovement({
    direction: 'out',
    amount: existing.amount,
    storeId: existing.storeId,
    category: 'Correction paiement',
    description: `Correction paiement #${existing.id} (ancien montant)`,
  })

  const [updated] = await db.update(payments).set({ amount: input.amount, method: input.method }).where(eq(payments.id, id)).returning()

  await recordAutoCashMovement({
    direction: 'in',
    amount: input.amount,
    storeId: existing.storeId,
    category: 'Correction paiement',
    description: `Correction paiement #${existing.id} (nouveau montant)`,
  })

  await db.insert(auditLog).values({
    entityType: 'payment',
    entityId: id,
    action: 'update',
    actorId: actor.userId,
    actorName: actor.userName,
    reason: reason ?? null,
    beforeData: existing,
    afterData: updated,
  })

  return updated
}

/**
 * Soft-deletes a client payment entered by mistake — reverses the amount it currently holds and
 * flags `deletedAt`. Does not touch `receivables`, same reasoning as `updatePayment`.
 */
export async function deletePayment(id: number, actor: Actor, reason?: string) {
  const [existing] = await db.select().from(payments).where(and(eq(payments.id, id), isNull(payments.deletedAt)))
  if (!existing) {
    throw new Error('Paiement introuvable.')
  }
  if (existing.saleId !== null) {
    throw new Error('Ce paiement est lié à une vente — annulez ou modifiez la vente directement.')
  }

  await recordAutoCashMovement({
    direction: 'out',
    amount: existing.amount,
    storeId: existing.storeId,
    category: 'Annulation paiement',
    description: `Annulation paiement #${existing.id}`,
  })

  const deletedAt = new Date().toISOString()
  await db.update(payments).set({ deletedAt }).where(eq(payments.id, id))

  await db.insert(auditLog).values({
    entityType: 'payment',
    entityId: id,
    action: 'delete',
    actorId: actor.userId,
    actorName: actor.userName,
    reason: reason ?? null,
    beforeData: existing,
  })

  return existing
}

/** Same as updatePayment, for a payment made to a supplier instead of received from a client. */
export async function updateSupplierPayment(
  id: number,
  input: { amount: number; method: (typeof paymentMethod)[number] },
  actor: Actor,
  reason?: string,
) {
  if (input.amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.')
  }

  const [existing] = await db.select().from(supplierPayments).where(and(eq(supplierPayments.id, id), isNull(supplierPayments.deletedAt)))
  if (!existing) {
    throw new Error('Paiement introuvable.')
  }

  await recordAutoCashMovement({
    direction: 'in',
    amount: existing.amount,
    category: 'Correction paiement fournisseur',
    description: `Correction paiement fournisseur #${existing.id} (ancien montant)`,
  })

  const [updated] = await db.update(supplierPayments).set({ amount: input.amount, method: input.method }).where(eq(supplierPayments.id, id)).returning()

  await recordAutoCashMovement({
    direction: 'out',
    amount: input.amount,
    category: 'Correction paiement fournisseur',
    description: `Correction paiement fournisseur #${existing.id} (nouveau montant)`,
  })

  await db.insert(auditLog).values({
    entityType: 'supplier_payment',
    entityId: id,
    action: 'update',
    actorId: actor.userId,
    actorName: actor.userName,
    reason: reason ?? null,
    beforeData: existing,
    afterData: updated,
  })

  return updated
}

/** Same as deletePayment, for a payment made to a supplier instead of received from a client. */
export async function deleteSupplierPayment(id: number, actor: Actor, reason?: string) {
  const [existing] = await db.select().from(supplierPayments).where(and(eq(supplierPayments.id, id), isNull(supplierPayments.deletedAt)))
  if (!existing) {
    throw new Error('Paiement introuvable.')
  }

  await recordAutoCashMovement({
    direction: 'in',
    amount: existing.amount,
    category: 'Annulation paiement fournisseur',
    description: `Annulation paiement fournisseur #${existing.id}`,
  })

  const deletedAt = new Date().toISOString()
  await db.update(supplierPayments).set({ deletedAt }).where(eq(supplierPayments.id, id))

  await db.insert(auditLog).values({
    entityType: 'supplier_payment',
    entityId: id,
    action: 'delete',
    actorId: actor.userId,
    actorName: actor.userName,
    reason: reason ?? null,
    beforeData: existing,
  })

  return existing
}
