export function formatFcfa(value: number) {
  // toLocaleString('fr-FR') separates thousands with a narrow no-break space (U+202F) — jsPDF's
  // built-in fonts (used for every PDF export/invoice in this app) don't have that glyph and
  // render it as a stray "/" instead. A plain space renders correctly everywhere, HTML included.
  const digits = Math.round(value).toLocaleString('fr-FR').replace(/[  ]/g, ' ')
  return `${digits} GNF`
}

export function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

export function formatTrend(pct: number) {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1).replace('.', ',')} %`
}

/**
 * Whether a due date has passed (day-level, not the exact instant — matches how a shopkeeper
 * thinks about an overdue debt and how the due-date notification banner already computes it).
 * Receivables/payables only ever get their `status` column written as 'pending' or 'paid' —
 * nothing in this codebase ever transitions it to 'overdue', so a dashboard/clients list that
 * trusted the stored status always read 0 overdue debts regardless of reality. This derives it
 * from the actual due date instead, the same way the notification banner always has.
 */
export function isPastDue(dueDate: string): boolean {
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}
