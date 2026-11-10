import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db/client'
import { auditLog, cashAccounts, cashMovements } from '@/lib/db/schema'
import { createCashAccount, deleteCashMovement, recordCashMovement, updateCashMovement } from '@/lib/db/mutations/cash-accounts'

const runId = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const testActor = { userId: `test-actor-${runId}`, userName: 'Test Suite' }
const accountIds: number[] = []
const movementIds: number[] = []

afterAll(async () => {
  for (const id of movementIds) {
    await db.delete(auditLog).where(and(eq(auditLog.entityType, 'cash_movement'), eq(auditLog.entityId, id)))
  }
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

describe('updateCashMovement', () => {
  it('undoes the old amount and applies the new one on the account balance', async () => {
    const account = await createCashAccount({ name: `Caisse édition ${runId}`, type: 'cash', initialBalance: 0 })
    accountIds.push(account.id)
    const movement = await recordCashMovement({ cashAccountId: account.id, type: 'expense', category: 'Loyer', amount: 10_000 })
    movementIds.push(movement.id)
    expect(await balanceOf(account.id)).toBe(-10_000)

    const updated = await updateCashMovement(movement.id, { type: 'expense', category: 'Transport', amount: 4_000 }, testActor)

    expect(updated.category).toBe('Transport')
    expect(updated.amount).toBe(4_000)
    expect(await balanceOf(account.id)).toBe(-4_000)
  })

  it('switching type from expense to deposit flips the balance effect accordingly', async () => {
    const account = await createCashAccount({ name: `Caisse bascule ${runId}`, type: 'cash', initialBalance: 0 })
    accountIds.push(account.id)
    const movement = await recordCashMovement({ cashAccountId: account.id, type: 'expense', category: 'Loyer', amount: 5_000 })
    movementIds.push(movement.id)
    expect(await balanceOf(account.id)).toBe(-5_000)

    await updateCashMovement(movement.id, { type: 'deposit', category: 'Vente comptant', amount: 5_000 }, testActor)

    expect(await balanceOf(account.id)).toBe(5_000)
  })

  it('writes an audit log row with the actor and a before/after snapshot', async () => {
    const account = await createCashAccount({ name: `Caisse audit ${runId}`, type: 'cash', initialBalance: 0 })
    accountIds.push(account.id)
    const movement = await recordCashMovement({ cashAccountId: account.id, type: 'expense', category: 'Loyer', amount: 1_000 })
    movementIds.push(movement.id)

    await updateCashMovement(movement.id, { type: 'expense', category: 'Transport', amount: 2_000 }, testActor, 'correction de motif')

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'cash_movement'), eq(auditLog.entityId, movement.id), eq(auditLog.action, 'update')))
    expect(entry.actorId).toBe(testActor.userId)
    expect(entry.reason).toBe('correction de motif')
    expect((entry.beforeData as { category: string }).category).toBe('Loyer')
    expect((entry.afterData as { category: string }).category).toBe('Transport')
  })

  it('rejects editing a movement that does not exist', async () => {
    await expect(updateCashMovement(999_999_999, { type: 'expense', category: 'Test', amount: 1_000 }, testActor)).rejects.toThrow(/introuvable/i)
  })
})

describe('deleteCashMovement', () => {
  it('reverses the balance effect and soft-deletes the movement', async () => {
    const account = await createCashAccount({ name: `Caisse suppression ${runId}`, type: 'cash', initialBalance: 0 })
    accountIds.push(account.id)
    const movement = await recordCashMovement({ cashAccountId: account.id, type: 'deposit', category: 'Vente comptant', amount: 8_000 })
    movementIds.push(movement.id)
    expect(await balanceOf(account.id)).toBe(8_000)

    await deleteCashMovement(movement.id, testActor, 'doublon')

    expect(await balanceOf(account.id)).toBe(0)
    const [row] = await db.select().from(cashMovements).where(eq(cashMovements.id, movement.id))
    expect(row).toBeDefined()
    expect(row.deletedAt).not.toBeNull()

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'cash_movement'), eq(auditLog.entityId, movement.id), eq(auditLog.action, 'delete')))
    expect(entry.reason).toBe('doublon')
  })

  it('rejects deleting a movement that does not exist (or was already deleted)', async () => {
    await expect(deleteCashMovement(999_999_999, testActor)).rejects.toThrow(/introuvable/i)
  })
})
