import { NextResponse } from 'next/server'

export function csvResponse(rows: Record<string, unknown>[], columns: { key: string; label: string }[], filename: string) {
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  function escapeCell(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value)
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  const header = columns.map((column) => escapeCell(column.label)).join(',')
  const lines = rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(','))
  return [header, ...lines].join('\r\n')
}
