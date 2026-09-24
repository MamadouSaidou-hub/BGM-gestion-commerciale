export function formatFcfa(value: number) {
  return `${Math.round(value).toLocaleString('fr-FR')} GNF`
}

export function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

export function formatTrend(pct: number) {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1).replace('.', ',')} %`
}
