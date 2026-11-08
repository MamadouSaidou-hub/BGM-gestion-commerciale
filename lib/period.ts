export type PeriodKey = 'today' | '7d' | 'month' | 'year'

const periodLabelToKey: Record<string, PeriodKey> = {
  'Aujourd’hui': 'today',
  '7 derniers jours': '7d',
  'Ce mois-ci': 'month',
  'Cette année': 'year',
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
  } else if (period === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else {
    start.setMonth(0, 1)
    start.setHours(0, 0, 0, 0)
  }
  const previousStart = new Date(start)
  const spanMs = now.getTime() - start.getTime()
  previousStart.setTime(start.getTime() - spanMs)
  return { start, previousStart, end: now }
}

const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const monthLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

/**
 * Chart buckets sized to whatever granularity actually shows a trend for the given period — a
 * single bucket spanning the whole thing wouldn't. Shared by every "évolution" chart (Dashboard,
 * Rapports) so they all bucket the same way for the same period instead of drifting apart.
 */
export function periodTrendBuckets(period: PeriodKey, start: Date, end: Date) {
  const buckets: { bucketStart: Date; bucketEnd: Date; label: string }[] = []

  if (period === 'today') {
    // Hourly buckets from midnight to the current hour.
    const cursor = new Date(start)
    while (cursor < end) {
      const bucketStart = new Date(cursor)
      const bucketEnd = new Date(cursor)
      bucketEnd.setHours(bucketEnd.getHours() + 1)
      buckets.push({ bucketStart, bucketEnd, label: bucketStart.toLocaleTimeString('fr-FR', { hour: '2-digit' }) })
      cursor.setHours(cursor.getHours() + 1)
    }
    return buckets
  }

  if (period === 'year') {
    // Monthly buckets from January to the current month.
    const cursor = new Date(start)
    while (cursor < end) {
      const bucketStart = new Date(cursor)
      const bucketEnd = new Date(cursor)
      bucketEnd.setMonth(bucketEnd.getMonth() + 1)
      buckets.push({ bucketStart, bucketEnd, label: monthLabels[bucketStart.getMonth()] })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return buckets
  }

  // 'today' is hourly, 'year' is monthly; '7d' and 'month' are both daily — a month still reads
  // fine as ~30 daily bars (the chart already scrolls horizontally), and weekly buckets would
  // hide the day-to-day swings a shopkeeper actually wants to see within the month.
  const cursor = new Date(start)
  while (cursor < end) {
    const bucketStart = new Date(cursor)
    const bucketEnd = new Date(cursor)
    bucketEnd.setDate(bucketEnd.getDate() + 1)
    buckets.push({ bucketStart, bucketEnd, label: `${dayLabels[bucketStart.getDay()]} ${bucketStart.getDate()}` })
    cursor.setDate(cursor.getDate() + 1)
  }
  return buckets
}
