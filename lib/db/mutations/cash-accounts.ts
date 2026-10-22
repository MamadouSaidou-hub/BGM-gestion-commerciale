import { eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { cashAccounts, cashAccountType, cashMovements, cashMovementType } from '../schema'

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
