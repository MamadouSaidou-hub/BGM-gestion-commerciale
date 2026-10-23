import { eq, ne, sql } from 'drizzle-orm'
import { db } from '../client'
import { cashAccounts, cashAccountType, cashMovements, cashMovementType } from '../schema'

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
