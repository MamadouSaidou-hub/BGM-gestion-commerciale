import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { db } from '../client'
import { auditLog, cashAccounts, cashAccountType, cashMovements, cashMovementType } from '../schema'

type CashMovementActor = { userId: string; userName: string }

/**
 * Auto-records a cash movement for money that actually changed hands elsewhere (a sale payment, a
 * client settling a receivable, a supplier payment) — so the caisse balance reflects reality
 * without someone re-entering the same amount by hand. Every such movement goes through the single
 * "caisse principale" (cash_accounts.is_default), regardless of payment method or store — from
 * there, redistributing to other caisses is a manual transfer (see transferBetweenCashAccounts).
 * If no default caisse is configured yet, the oldest account is used as a fallback so money is
 * still tracked somewhere; if there's no caisse at all, the movement is simply skipped — this never
 * blocks the sale/payment itself from succeeding.
 */
export async function recordAutoCashMovement(input: {
  direction: 'in' | 'out'
  amount: number
  storeId?: number | null
  category: string
  description?: string | null
}) {
  if (input.amount <= 0) return null

  const accounts = await db.select().from(cashAccounts).orderBy(cashAccounts.id)
  const account = accounts.find((row) => row.isDefault) ?? accounts[0]
  if (!account) return null

  return recordCashMovement({
    cashAccountId: account.id,
    type: input.direction === 'in' ? 'deposit' : 'expense',
    category: input.category,
    description: input.description,
    amount: input.amount,
    storeId: input.storeId ?? null,
  })
}

export async function setDefaultCashAccount(id: number) {
  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, id))
    if (!account) throw new Error('Caisse introuvable.')
    await tx.update(cashAccounts).set({ isDefault: false }).where(ne(cashAccounts.id, id))
    const [updated] = await tx.update(cashAccounts).set({ isDefault: true }).where(eq(cashAccounts.id, id)).returning()
    return updated
  })
}

export async function transferBetweenCashAccounts(input: { fromId: number; toId: number; amount: number; description?: string | null }) {
  if (input.fromId === input.toId) {
    throw new Error('Choisissez deux caisses différentes.')
  }
  if (input.amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.')
  }

  return db.transaction(async (tx) => {
    const [fromAccount] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, input.fromId))
    const [toAccount] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, input.toId))
    if (!fromAccount || !toAccount) {
      throw new Error('Caisse introuvable.')
    }

    await tx.insert(cashMovements).values([
      { cashAccountId: input.fromId, type: 'expense', category: 'Transfert interne', description: input.description ?? `Vers ${toAccount.name}`, amount: input.amount },
      { cashAccountId: input.toId, type: 'deposit', category: 'Transfert interne', description: input.description ?? `Depuis ${fromAccount.name}`, amount: input.amount },
    ])

    await tx.update(cashAccounts).set({ balance: sql`${cashAccounts.balance} - ${input.amount}` }).where(eq(cashAccounts.id, input.fromId))
    await tx.update(cashAccounts).set({ balance: sql`${cashAccounts.balance} + ${input.amount}` }).where(eq(cashAccounts.id, input.toId))

    return { fromId: input.fromId, toId: input.toId, amount: input.amount }
  })
}

export async function createCashAccount(input: {
  name: string
  type: (typeof cashAccountType)[number]
  storeId?: number | null
  initialBalance: number
}) {
  const [account] = await db
    .insert(cashAccounts)
    .values({
      name: input.name,
      type: input.type,
      balance: input.initialBalance,
      storeId: input.storeId ?? null,
    })
    .returning()

  return account
}

export async function recordCashMovement(input: {
  cashAccountId: number
  type: (typeof cashMovementType)[number]
  category: string
  description?: string | null
  amount: number
  storeId?: number | null
}) {
  if (input.amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.')
  }

  return db.transaction(async (tx) => {
    const [account] = await tx.select().from(cashAccounts).where(eq(cashAccounts.id, input.cashAccountId))
    if (!account) {
      throw new Error('Caisse introuvable.')
    }

    const [movement] = await tx
      .insert(cashMovements)
      .values({
        cashAccountId: input.cashAccountId,
        storeId: input.storeId ?? null,
        type: input.type,
        category: input.category,
        description: input.description ?? null,
        amount: input.amount,
      })
      .returning()

    const delta = input.type === 'deposit' ? input.amount : -input.amount
    await tx
      .update(cashAccounts)
      .set({ balance: sql`${cashAccounts.balance} + ${delta}` })
      .where(eq(cashAccounts.id, input.cashAccountId))

    return movement
  })
}

/**
 * Corrects a cash movement entered by mistake (wrong amount/category/type) without losing its id
 * or its place in the caisse's history. The account's `balance` is a running total, not something
 * recomputed from summing movements, so the edit must undo the old amount's effect and apply the
 * new one in the same step — equivalent to deleting then re-recording, but as one row.
 */
export async function updateCashMovement(
  id: number,
  input: { category: string; description?: string | null; amount: number; type: (typeof cashMovementType)[number] },
  actor: CashMovementActor,
  reason?: string,
) {
  if (input.amount <= 0) {
    throw new Error('Le montant doit être supérieur à zéro.')
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(cashMovements).where(and(eq(cashMovements.id, id), isNull(cashMovements.deletedAt)))
    if (!existing) {
      throw new Error('Mouvement introuvable.')
    }

    const oldDelta = existing.type === 'deposit' ? existing.amount : -existing.amount
    const newDelta = input.type === 'deposit' ? input.amount : -input.amount
    await tx
      .update(cashAccounts)
      .set({ balance: sql`${cashAccounts.balance} - ${oldDelta} + ${newDelta}` })
      .where(eq(cashAccounts.id, existing.cashAccountId))

    const [updated] = await tx
      .update(cashMovements)
      .set({ category: input.category, description: input.description ?? null, amount: input.amount, type: input.type })
      .where(eq(cashMovements.id, id))
      .returning()

    await tx.insert(auditLog).values({
      entityType: 'cash_movement',
      entityId: id,
      action: 'update',
      actorId: actor.userId,
      actorName: actor.userName,
      reason: reason ?? null,
      beforeData: existing,
      afterData: updated,
    })

    return updated
  })
}

/**
 * Soft-deletes a cash movement entered by mistake — reverses its effect on the account's running
 * balance and flags it `deletedAt` (kept in the database, not erased) so an admin can later see
 * that it existed and who removed it.
 */
export async function deleteCashMovement(id: number, actor: CashMovementActor, reason?: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(cashMovements).where(and(eq(cashMovements.id, id), isNull(cashMovements.deletedAt)))
    if (!existing) {
      throw new Error('Mouvement introuvable.')
    }

    const delta = existing.type === 'deposit' ? existing.amount : -existing.amount
    await tx
      .update(cashAccounts)
      .set({ balance: sql`${cashAccounts.balance} - ${delta}` })
      .where(eq(cashAccounts.id, existing.cashAccountId))

    const deletedAt = new Date().toISOString()
    await tx.update(cashMovements).set({ deletedAt }).where(eq(cashMovements.id, id))

    await tx.insert(auditLog).values({
      entityType: 'cash_movement',
      entityId: id,
      action: 'delete',
      actorId: actor.userId,
      actorName: actor.userName,
      reason: reason ?? null,
      beforeData: existing,
    })

    return existing
  })
}
