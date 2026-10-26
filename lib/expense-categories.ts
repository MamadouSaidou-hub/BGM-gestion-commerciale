/**
 * Fixed list for expense ("dépense") cash movements — deliberately not free text. Before this,
 * the "Motif" field let each user type anything ("Transport", "transport", "Frais de transport"),
 * which fragmented category statistics into near-duplicates. Deposits ("dépôt") keep free text:
 * their motifs are naturally varied (client name, sale reference...) and aren't the thing being
 * analyzed here — it's expenses the business wants to see broken down.
 *
 * Internal caisse-to-caisse transfers also write an expense row (category 'Transfert interne',
 * see lib/db/mutations/cash-accounts.ts) — that's money moving between your own accounts, not a
 * real cost, so it's excluded from this list and from expense breakdown statistics.
 */
export const EXPENSE_CATEGORIES = [
  'Loyer',
  'Salaires',
  'Transport',
  'Achats & fournitures',
  'Entretien & réparations',
  'Électricité & eau',
  'Communication',
  'Impôts & taxes',
  'Autre',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value)
}
