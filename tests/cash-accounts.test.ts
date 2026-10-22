import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { cashAccounts, cashMovements } from '@/lib/db/schema'
import { createCashAccount, recordCashMovement } from '@/lib/db/mutations/cash-accounts'

const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const accountIds: number[] = []

afterAll(async () => {
  for (const id of accountIds) {
    await db.delete(cashMovements).where(eq(cashMovements.cashAccountId, id))
    await db.delete(cashAccounts).where(eq(cashAccounts.id, id))
  }
})

async function balanceOf(accountId: number) {
  const [row] = await db.select({ balance: cashAccounts.balance }).from(cashAccounts).where(eq(cashAccounts.id, accountId))
  return row?.balance ?? 0
}

describe('createCashAccount', () => {
  it('creates an account with the given initial balance', async () => {
    const account = await createCashAccount({ name: `Caisse test ${runId}`, type: 'cash', initialBalance: 50_000 })
    accountIds.push(account.id)

    expect(account.balance).toBe(50_000)
    expect(account.type).toBe('cash')
  })
})

describe('recordCashMovement', () => {
  it('an expense debits the account balance and is recorded with type "expense"', async () => {
    const account = await createCashAccount({ name: `Caisse dépense ${runId}`, type: 'bank', initialBalance: 100_000 })
    accountIds.push(account.id)

    const movement = await recordCashMovement({ cashAccountId: account.id, type: 'expense', category: 'Loyer', amount: 30_000 })

    expect(movement.type).toBe('expense')
    expect(movement.category).toBe('Loyer')
    expect(await balanceOf(account.id)).toBe(70_000)
  })

  it('a deposit credits the account balance and is recorded with type "deposit"', async () => {
    const account = await createCashAccount({ name: `Caisse dépôt ${runId}`, type: 'mobile_money', initialBalance: 10_000 })
    accountIds.push(account.id)

    const movement = await recordCashMovement({ cashAccountId: account.id, type: 'deposit', category: 'Vente comptant', amount: 25_000 })

    expect(movement.type).toBe('deposit')
    expect(await balanceOf(account.id)).toBe(35_000)
  })

  it('allows the balance to go negative (an expense can be recorded before its matching deposit)', async () => {
    const account = await createCashAccount({ name: `Caisse négative ${runId}`, type: 'cash', initialBalance: 5_000 })
    accountIds.push(account.id)

    await recordCashMovement({ cashAccountId: account.id, type: 'expense', category: 'Transport', amount: 12_000 })

    expect(await balanceOf(account.id)).toBe(-7_000)
  })

  it('two concurrent movements on the same account both apply correctly (no lost update)', async () => {
    const account = await createCashAccount({ name: `Caisse concurrente ${runId}`, type: 'cash', initialBalance: 0 })
    accountIds.push(account.id)

    await Promise.all(
      Array.from({ length: 10 }, () => recordCashMovement({ cashAccountId: account.id, type: 'deposit', category: 'Test', amount: 1_000 })),
    )

    expect(await balanceOf(account.id)).toBe(10_000)
    const movements = await db.select().from(cashMovements).where(and(eq(cashMovements.cashAccountId, account.id)))
    expect(movements).toHaveLength(10)
  })

  it('rejects an unknown cash account', async () => {
    await expect(recordCashMovement({ cashAccountId: 999_999_999, type: 'expense', category: 'Test', amount: 1_000 })).rejects.toThrow(/introuvable/i)
  })
})
