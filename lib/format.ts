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
