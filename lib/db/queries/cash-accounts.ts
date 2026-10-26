import { desc, eq, gte } from 'drizzle-orm'
import { db } from '../client'
import { cashAccounts, cashMovements } from '../schema'
import { formatFcfa } from '@/lib/format'
import { periodRange, type PeriodKey } from '@/lib/period'

export async function getCashAccountsOverview(period: PeriodKey) {
  const { start } = periodRange(period)

  // Independent reads — run concurrently (same reasoning as treasury.ts/dashboard.ts: this is a
  // remote Postgres instance, not in-process SQLite, so each sequential await is a real round trip).
  const [accountRows, movementRows] = await Promise.all([
    db.select().from(cashAccounts).orderBy(cashAccounts.name),
    db
      .select({
        id: cashMovements.id,
        type: cashMovements.type,
        category: cashMovements.category,
        description: cashMovements.description,
        amount: cashMovements.amount,
        createdAt: cashMovements.createdAt,
        accountName: cashAccounts.name,
      })
      .from(cashMovements)
      .innerJoin(cashAccounts, eq(cashMovements.cashAccountId, cashAccounts.id))
      .where(gte(cashMovements.createdAt, start.toISOString()))
      .orderBy(desc(cashMovements.createdAt)),
  ])

  const totalBalance = accountRows.reduce((sum, row) => sum + row.balance, 0)
  const totalExpenses = movementRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0)
  const totalDeposits = movementRows.filter((row) => row.type === 'deposit').reduce((sum, row) => sum + row.amount, 0)

  // "Transfert interne" (caisse-to-caisse) is money moving between the business's own accounts,
  // not a real cost — included it would inflate the breakdown with a fake "where did the money go"
  // answer. Everything else here comes from the fixed EXPENSE_CATEGORIES list (lib/expense-categories.ts).
  const realExpenses = movementRows.filter((row) => row.type === 'expense' && row.category !== 'Transfert interne')
  const realExpensesTotal = realExpenses.reduce((sum, row) => sum + row.amount, 0)
  const byCategory = new Map<string, number>()
  for (const row of realExpenses) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount)
  }
  const expenseBreakdown = [...byCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      amountFormatted: formatFcfa(amount),
      pct: realExpensesTotal > 0 ? (amount / realExpensesTotal) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    accounts: accountRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      balance: row.balance,
      balanceFormatted: formatFcfa(row.balance),
      isDefault: row.isDefault,
    })),
    movements: movementRows.map((row) => ({
      id: row.id,
      date: row.createdAt,
      account: row.accountName,
      type: row.type,
      category: row.category,
      description: row.description,
      amountFormatted: formatFcfa(row.amount),
    })),
    summary: {
      totalBalance: formatFcfa(totalBalance),
      totalExpenses: formatFcfa(totalExpenses),
      totalDeposits: formatFcfa(totalDeposits),
      accountCount: accountRows.length,
    },
    expenseBreakdown,
  }
}

export async function getCashAccountOptions() {
  return db.select({ id: cashAccounts.id, name: cashAccounts.name }).from(cashAccounts).orderBy(cashAccounts.name)
}
