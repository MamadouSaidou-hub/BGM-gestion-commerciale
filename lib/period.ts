export type PeriodKey = 'today' | '7d' | 'month'

const periodLabelToKey: Record<string, PeriodKey> = {
  'Aujourd’hui': 'today',
  '7 derniers jours': '7d',
  'Ce mois-ci': 'month',
}

export function parsePeriodLabel(label: string | null, fallback: PeriodKey = 'today'): PeriodKey {
  if (!label) return fallback
  return periodLabelToKey[label] ?? fallback
}

export function periodRange(period: PeriodKey) {
  const now = new Date()
  const start = new Date(now)
  if (period === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (period === '7d') {
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }
  const previousStart = new Date(start)
  const spanMs = now.getTime() - start.getTime()
  previousStart.setTime(start.getTime() - spanMs)
  return { start, previousStart, end: now }
}
