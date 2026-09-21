import type { PanelNode } from '../../api/types'
import { newId } from './panelTree'

/** Best-estimate dataType from a sample value -- specs: "1 or 2 rows of datastore available data". */
function inferDataType(value: unknown): 'str' | 'number' | 'datetime' | 'date' {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return 'datetime'
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  }
  return 'str'
}

/** specs: "by default align string -> left; number -> right; datetime -> left". Only meaningful for table columns. */
function alignFor(dataType: 'str' | 'number' | 'datetime' | 'date'): 'left' | 'right' {
  return dataType === 'number' ? 'right' : 'left'
}

/** "close_price" / "closePrice" -> "Close Price". */
export function prettifyFieldName(field: string): string {
  const spaced = field.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

/**
 * Builds datatable-column/chart-column/pivot-column/kpi-column nodes from a
 * small sample of datastore rows (specs: "Load Columns" -- use the datastore
 * associated with the control to populate columns, inferring type/alignment
 * from 1-2 sample rows; specs/kpi.md's "Generate Cards" is the same
 * mechanism under a different label -- see EditorPage.tsx's finishLoadColumns).
 * Field order follows first-seen order across the sample so it matches the
 * datastore's own column order.
 *
 * pivot-column has no natural default role (index/column/value can't be
 * inferred from a sample row) -- every loaded pivot-column starts as
 * role=value/aggrFunction=sum, left for the user to reassign afterward.
 */
export function buildColumnsFromSample(
  rows: unknown[],
  columnType: 'datatable-column' | 'chart-column' | 'pivot-column' | 'kpi-column',
): PanelNode[] {
  const fields: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if (!seen.has(key)) {
        seen.add(key)
        fields.push(key)
      }
    }
  }

  return fields.map((field) => {
    const sampleRow = rows.find((r) => r && typeof r === 'object' && field in (r as Record<string, unknown>)) as
      | Record<string, unknown>
      | undefined
    const dataType = inferDataType(sampleRow?.[field])
    const fieldDisplay = prettifyFieldName(field)
    const base: PanelNode = {
      id: newId(columnType),
      type: columnType,
      field,
      fieldDisplay,
      dataType,
    }
    if (columnType === 'datatable-column') return { ...base, align: alignFor(dataType) }
    if (columnType === 'pivot-column') return { ...base, role: 'value', aggrFunction: 'sum', sort: 'none' }
    // kpi-column: specs/kpi.md's defaults -- header shows the field's label,
    // body looks the field itself up in the kpi's current row (see
    // KpiControl.tsx's resolveExpression: bodyValue "field" isn't literal
    // text, it's the lookup key), footer starts empty (omitted at render).
    if (columnType === 'kpi-column') return { ...base, headerValue: fieldDisplay, bodyValue: field, footerValue: '' }
    return base
  })
}
