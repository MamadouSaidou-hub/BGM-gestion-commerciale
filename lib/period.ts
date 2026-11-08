export type PeriodKey = 'today' | '7d' | 'month' | 'year' | 'custom'
export type CustomRange = { from: string; to: string }

const periodLabelToKey: Record<string, PeriodKey> = {
  'Aujourd’hui': 'today',
  '7 derniers jours': '7d',
  'Ce mois-ci': 'month',
  'Cette année': 'year',
  'Personnalisé': 'custom',
}

export function parsePeriodLabel(label: string | null, fallback: PeriodKey = 'today'): PeriodKey {
  if (!label) return fallback
  return periodLabelToKey[label] ?? fallback
}

export function periodRange(period: PeriodKey, custom?: CustomRange) {
  if (period === 'custom' && custom?.from && custom?.to) {
    const start = new Date(`${custom.from}T00:00:00`)
    const end = new Date(`${custom.to}T23:59:59.999`)
    const spanMs = Math.max(end.getTime() - start.getTime(), 0)
    const previousStart = new Date(start.getTime() - spanMs)
    return { start, previousStart, end }
  }

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
 * Chart buckets sized to the actual span between start/end rather than to the period's name — a
 * custom range can be as short as a single day or as long as several years, so the granularity is
 * derived from how many days it covers (same thresholds that already matched "today"/"year" when
 * those were the only choices): <=1.5 days -> hourly, <=60 days -> daily, longer -> monthly. Shared
 * by every "évolution" chart (Dashboard, Rapports) so they all bucket the same way for the same span.
 */
export function periodTrendBuckets(start: Date, end: Date) {
  const buckets: { bucketStart: Date; bucketEnd: Date; label: string }[] = []
  const spanDays = (end.getTime() - start.getTime()) / 86_400_000

  if (spanDays <= 1.5) {
    // Hourly buckets from the start to the end of the span.
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

  if (spanDays > 60) {
    // Monthly buckets — daily bars would be unreadable past ~2 months.
    const cursor = new Date(start)
    while (cursor < end) {
      const bucketStart = new Date(cursor)
      const bucketEnd = new Date(cursor)
      bucketEnd.setMonth(bucketEnd.getMonth() + 1)
      buckets.push({ bucketStart, bucketEnd, label: `${monthLabels[bucketStart.getMonth()]} ${bucketStart.getFullYear()}` })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return buckets
  }

  // Daily buckets — fine up to ~2 months (the chart already scrolls horizontally), and weekly
  // buckets would hide the day-to-day swings a shopkeeper actually wants to see.
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
