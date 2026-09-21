import type { PanelNode } from '../api/types'
import { getFieldValue } from './panelFormat'

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value)
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/** Builds a CSV string from a plain 2D grid of cells (e.g. a pivot's rendered header + body + footer rows). */
export function gridToCsv(grid: unknown[][]): string {
  return grid.map((line) => line.map(csvEscape).join(',')).join('\r\n')
}

/** Builds a CSV string from row objects, using datatable-column/chart-column defs for header labels + field paths when available, else the raw keys of the first row. */
export function rowsToCsv(rows: Record<string, unknown>[], columns?: PanelNode[]): string {
  const cols = columns?.length
    ? columns.map((c) => ({ path: c.field || '', label: c.fieldDisplay || c.field || c.id }))
    : Object.keys(rows[0] ?? {}).map((key) => ({ path: key, label: key }))

  const lines = [cols.map((c) => c.label), ...rows.map((row) => cols.map((c) => getFieldValue(row, c.path)))]
  return gridToCsv(lines)
}

const BOM = String.fromCharCode(0xfeff)

/** Triggers a browser download of `csv` as a .csv file -- a leading BOM keeps Excel from mis-detecting the encoding. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Filesystem-safe base filename derived from a control's (resolved) title or id. */
export function sanitizeFilename(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'export'
}
