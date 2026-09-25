import type { CSSProperties } from 'react'
import type { Column, ColumnDef } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import type { DataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import { DataGridTableRowExpand } from '../reui/data-grid/data-grid-table'
import type { PanelNode } from '../../api/types'
import { formatValue, getFieldValue, parseCssText } from '../../utils/panelFormat'
import { aggregate } from '../../utils/pivot'

export type DatatableRow = Record<string, unknown> & { id: string | number }
export interface TreeRow extends DatatableRow {
  subRows?: TreeRow[]
}

/**
 * Row-identity key groupRows stamps a grouped row with (its distinct value
 * of the groupFunction='value' column) -- deliberately NOT the data's own
 * "id" field, which stays free for a real datatable-column literally named
 * "id" to display normally. DatatableControl's getRowId prefers this over
 * the configured idField whenever it's present.
 */
export const GROUP_ROW_KEY = '__groupKey'

export function toRows(data: unknown): DatatableRow[] {
  if (!Array.isArray(data)) return []
  return data.map((row, index) => {
    const record = row as Record<string, unknown>
    return (record.id === undefined ? { id: index, ...record } : record) as DatatableRow
  })
}

/** Writes into a possibly dot-path'd row key, creating intermediate objects as needed -- the write-side counterpart to getFieldValue's dot-path read. */
function setFieldValue(row: Record<string, unknown>, fieldPath: string, value: unknown): void {
  const keys = fieldPath.split('.')
  let target = row
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (typeof target[key] !== 'object' || target[key] === null) target[key] = {}
    target = target[key] as Record<string, unknown>
  }
  target[keys[keys.length - 1]] = value
}

/**
 * Buckets `rows` by distinct value of the single datatable-column marked
 * groupFunction='value' (a real GROUP BY -- by value regardless of row
 * order, not just merging adjacent duplicates) and, for each bucket, builds
 * a collapsible synthetic header row (marked with GROUP_ROW_KEY) whose
 * `subRows` are the bucket's real, untouched original rows -- rendered via
 * the same TanStack expand/collapse machinery as treeRows. The header row
 * shows the group's value in the groupFunction='value' column, each other
 * groupFunction column's aggregate across the bucket, and leaves every
 * unconfigured column blank (no groupFunction -> nothing set -> blank cell)
 * rather than guessing at a representative value.
 * A no-op when no column has groupFunction='value' set. If more than one
 * does (only one is meant to), the first one found wins.
 */
export function groupRows(rows: DatatableRow[], columns: PanelNode[]): TreeRow[] {
  const groupCol = columns.find((c) => c.groupFunction === 'value')
  if (!groupCol || rows.length === 0) return rows
  const path = groupCol.field || ''

  const buckets = new Map<string, DatatableRow[]>()
  const order: string[] = []
  for (const row of rows) {
    const key = String(getFieldValue(row, path) ?? '')
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.push(row)
  }

  return order.map((key) => {
    const bucketRows = buckets.get(key)!
    const grouped: TreeRow = { id: key, [GROUP_ROW_KEY]: key, subRows: bucketRows }
    setFieldValue(grouped, path, getFieldValue(bucketRows[0], path))
    for (const col of columns) {
      const colPath = col.field || ''
      if (!colPath || !col.groupFunction || col.groupFunction === 'value') continue
      const nums = bucketRows.map((r) => Number(getFieldValue(r, colPath))).filter((n) => !Number.isNaN(n))
      setFieldValue(grouped, colPath, aggregate(nums, col.groupFunction))
    }
    return grouped
  })
}

/** Nests a flat id/parent-id table into `subRows` arrays for TanStack's row-expanding feature. */
export function buildTreeRows(rows: DatatableRow[], idField: string, parentField: string): TreeRow[] {
  const byId = new Map<string, TreeRow>(rows.map((r) => [String(r[idField]), { ...r }]))
  const roots: TreeRow[] = []
  byId.forEach((row) => {
    const parentId = row[parentField] != null ? String(row[parentField]) : null
    const parent = parentId && parentId !== String(row[idField]) ? byId.get(parentId) : undefined
    if (parent) {
      parent.subRows = parent.subRows ?? []
      parent.subRows.push(row)
    } else {
      roots.push(row)
    }
  })
  return roots
}

/** PanelNode.signalOnUpdate's non-legacy values (see its own doc comment for the `true` shorthand). */
export type SignalMode = 'neutral' | 'green-up-red-down' | 'red-up-green-down'
/** Per-cell result of diffChangedCells: 'up'/'down' only when both the old and new value parsed as numbers, 'neutral' for any other changed value (a string/date/badge column, or a number that couldn't be compared). */
export type SignalDirection = 'up' | 'down' | 'neutral'

/**
 * `Signal on Update` (PanelNode.signalOnUpdate): compares `nextRows` against
 * the previous fetch's flat rows by `id` and returns the `${id}::${path}`
 * key of every visible column whose value actually changed on a row present
 * in both, mapped to the direction of that change -- new rows (no matching
 * prior id) and removed rows aren't "changes" to a value, so they're never
 * flagged. Relies on `id` being a real, unique field on the dataset: `toRows`
 * stamps a positional index as `id` when the data has none, which would
 * misread "row order shifted" as "every value in this slot changed" -- the
 * PanelNode.signalOnUpdate doc comment and its editor field both call this
 * out.
 *
 * Direction is computed unconditionally, independent of which signalMode the
 * table is actually in -- resolving 'neutral' mode's flat amber vs. a
 * directional mode's green/red is the cell renderer's job (buildColumns),
 * not this diff.
 */
export function diffChangedCells(prevRows: DatatableRow[], nextRows: DatatableRow[], columns: PanelNode[]): Map<string, SignalDirection> {
  const changed = new Map<string, SignalDirection>()
  if (prevRows.length === 0 || nextRows.length === 0) return changed
  const prevById = new Map<string, DatatableRow>(prevRows.map((r) => [String(r.id), r]))
  const paths = columns.filter((c) => !c.hidden).map((c) => c.field || '')
  for (const row of nextRows) {
    const prev = prevById.get(String(row.id))
    if (!prev) continue
    for (const path of paths) {
      if (!path) continue
      const prevValue = getFieldValue(prev, path)
      const nextValue = getFieldValue(row, path)
      if (prevValue === nextValue) continue
      const prevNum = typeof prevValue === 'number' ? prevValue : parseFloat(String(prevValue))
      const nextNum = typeof nextValue === 'number' ? nextValue : parseFloat(String(nextValue))
      const direction: SignalDirection =
        Number.isFinite(prevNum) && Number.isFinite(nextNum) && prevNum !== nextNum ? (nextNum > prevNum ? 'up' : 'down') : 'neutral'
      changed.set(`${row.id}::${path}`, direction)
    }
  }
  return changed
}

export function alignStyle(align: PanelNode['align']): CSSProperties | undefined {
  if (align === 'right') return { display: 'block', width: '100%', textAlign: 'right' }
  if (align === 'middle') return { display: 'block', width: '100%', textAlign: 'center' }
  return undefined
}

function renderCellContent(value: unknown, col: PanelNode) {
  if (col.dataType === 'badge') {
    return value === null || value === undefined || value === '' ? null : <Badge variant="secondary">{String(value)}</Badge>
  }
  if (col.dataType === 'number') {
    if (value === null || value === undefined || value === '') return '-'
    const num = typeof value === 'number' ? value : parseFloat(String(value))
    const formatted = formatValue(value, col.dataType, col.dataFormat, col.humanReadable)
    return num < 0 ? <span className="text-destructive">{formatted}</span> : formatted
  }
  return formatValue(value, col.dataType, col.dataFormat, col.humanReadable)
}

interface BuildColumnsOptions {
  /** First column additionally renders the tree expand/collapse chevron. */
  treeToggle?: boolean
  /** Called when a cell in a `parameter`-linked column is clicked. */
  onLinkedCellClick?: (col: PanelNode, value: unknown, row: DatatableRow) => void
  /** The datatable's own "Filter" toggle -- a column only gets a header filter when this AND its own filterType are both set. */
  filterEnabled?: boolean
  /** `${id}::${path}` -> direction, currently flashing, from diffChangedCells -- see PanelNode.signalOnUpdate. */
  changedCells?: Map<string, SignalDirection>
  /** Resolved from PanelNode.signalOnUpdate (its legacy `true` already normalized to 'neutral' by the caller) -- which color a flashing cell's direction maps to. Only meaningful when changedCells is set. */
  signalMode?: SignalMode
  /** Per-column colorScale domain, from DatatableControl's own useMemo -- see colorScaleStyle. */
  colorScaleDomains?: ColorScaleDomains
}

/** Resolves a changed cell's flash class for the datatable's configured signalMode -- 'neutral' (or a non-numeric change under any mode) is the original flat amber; the two directional modes swap which direction is green/red. 30% opacity per spec, vs. neutral's own 40%. */
function signalFlashClass(direction: SignalDirection, signalMode: SignalMode): string {
  if (direction === 'neutral' || signalMode === 'neutral') return 'bg-warning/40'
  const isUp = direction === 'up'
  const green = signalMode === 'green-up-red-down' ? isUp : !isUp
  return green ? 'bg-success/30' : 'bg-destructive/30'
}

/** A column's `colorScale` min/max, computed once per render -- see DatatableControl.tsx's own colorScaleDomains useMemo. */
export interface ColorScaleDomain {
  min: number
  max: number
}

// Fixed palette (PanelNode.colorScale doesn't expose custom colors in v1) --
// low/high match the red/green signalFlashClass's directional modes already
// use (--color-destructive/--color-success), so a table mixing both features
// reads consistently; mid is a neutral amber-ish middle, same spirit as the
// flash's own 'neutral' color.
const COLOR_SCALE_LOW: [number, number, number] = [220, 38, 38] // --destructive
const COLOR_SCALE_MID: [number, number, number] = [234, 179, 8] // amber-500, matches --warning
const COLOR_SCALE_HIGH: [number, number, number] = [16, 185, 129] // emerald-500, matches --success

function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r} ${g} ${bl} / 0.35)`
}

/**
 * Persistent cell background for PanelNode.colorScale -- undefined (no
 * color) when the scale is off, the column isn't numeric, the value doesn't
 * parse as a finite number, or `domain` is degenerate (min===max: nothing to
 * scale against, e.g. every loaded row has the same value, or there's only
 * one row). 'sequential' interpolates low->high across the whole domain;
 * 'diverging' interpolates low->mid over the bottom half and mid->high over
 * the top half.
 */
function colorScaleStyle(value: unknown, col: PanelNode, domain: ColorScaleDomain | undefined): CSSProperties | undefined {
  if (!col.colorScale || col.colorScale === 'none' || col.dataType !== 'number' || !domain) return undefined
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(num) || domain.min === domain.max) return undefined
  const t = Math.min(1, Math.max(0, (num - domain.min) / (domain.max - domain.min)))
  if (col.colorScale === 'sequential') return { backgroundColor: lerpRgb(COLOR_SCALE_LOW, COLOR_SCALE_HIGH, t) }
  return { backgroundColor: t < 0.5 ? lerpRgb(COLOR_SCALE_LOW, COLOR_SCALE_MID, t * 2) : lerpRgb(COLOR_SCALE_MID, COLOR_SCALE_HIGH, (t - 0.5) * 2) }
}

/** Column id -> its colorScale domain, from DatatableControl's own useMemo -- absent/no entry means that column isn't color-scaled (or has no domain to scale against yet). */
export type ColorScaleDomains = Map<string, ColorScaleDomain>

/**
 * A column's filter control, rendered inside its own header (REUI's
 * per-column header filter pattern -- see DataGridColumnHeader's `filter`
 * prop) rather than in a separate bar above the grid. 'text' is a free-text
 * substring match; 'selector' is an inline checkbox list -- selecting
 * multiple values ORs them together (row kept if its value equals any
 * checked option), matching the `selectorMatch` filterFn buildColumns wires
 * up for that type. (TanStack's built-in "some of these array values"
 * filter, `arrIncludesSome`, requires the *row's* value to itself be an
 * array -- a datatable column value is a scalar, so that filterFn always
 * returned no rows here.)
 */
function HeaderFilterContent({
  col,
  rows,
  column,
}: {
  col: PanelNode
  rows: DatatableRow[]
  column: Column<DataGridFeatures, DatatableRow>
}) {
  const label = col.fieldDisplay || col.field || col.id

  if (col.filterType === 'text') {
    return (
      <Input
        placeholder={`Filter ${label}`}
        value={(column.getFilterValue() as string) ?? ''}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        onKeyDown={(e) => e.stopPropagation()}
        className="h-7 w-full text-[0.8em]"
      />
    )
  }

  const options = uniqueValues(rows, col.field || '')
  const filterValue = column.getFilterValue()
  const selected = new Set(Array.isArray(filterValue) ? (filterValue as string[]) : [])
  const toggle = (opt: string) => {
    const next = new Set(selected)
    if (next.has(opt)) next.delete(opt)
    else next.add(opt)
    column.setFilterValue(next.size ? Array.from(next) : undefined)
  }

  return (
    <div className="flex w-full flex-col gap-0.5">
      <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
        {options.map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-[0.8em] font-normal hover:bg-muted"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox checked={selected.has(opt)} onCheckedChange={() => toggle(opt)} />
            <span className="truncate">{opt}</span>
          </label>
        ))}
        {options.length === 0 && <div className="px-1 py-1 text-[0.78em] text-muted-foreground">No values.</div>}
      </div>
      {selected.size > 0 && (
        <button
          type="button"
          className="mt-0.5 px-1 text-left text-[0.78em] text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            column.setFilterValue(undefined)
          }}
        >
          Clear filter
        </button>
      )}
    </div>
  )
}

/** Builds TanStack column defs from datatable-column/chart-column children, or infers them from the first row when none are configured. */
export function buildColumns<TData extends DatatableRow = DatatableRow>(
  columns: PanelNode[] | undefined,
  rows: DatatableRow[],
  options?: BuildColumnsOptions,
): ColumnDef<DataGridFeatures, TData>[] {
  const configuredOrInferred: PanelNode[] = columns?.length
    ? columns
    : Object.keys(rows[0] ?? {})
        .filter((key) => key !== 'id' && key !== 'subRows')
        .map((field) => ({ id: field, type: 'datatable-column', field }))
  const cols = configuredOrInferred.filter((col) => !col.hidden)

  return cols.map((col, index) => {
    const path = col.field || ''
    const label = col.fieldDisplay || col.field || path
    const clickable = !!col.parameter && !!options?.onLinkedCellClick
    // 'text' -> HeaderFilterContent's free-text Input (substring match);
    // 'selector' -> its inline checkbox list, whose filter value is always
    // an array of the checked options ORed together. Every column needs an
    // explicit filterFn: dataGridFeatures registers no "auto" detection, so
    // a column left without one silently keeps every row (see data-grid.tsx's
    // filterFns registry comment).
    const filterFn = col.filterType === 'text' ? 'includesString' : col.filterType ? 'selectorMatch' : undefined
    const hasHeaderFilter = !!options?.filterEnabled && !!col.filterType

    return {
      id: col.id,
      accessorFn: (row) => getFieldValue(row as Record<string, unknown>, path),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title={label}
          filter={hasHeaderFilter ? <HeaderFilterContent col={col} rows={rows} column={column as unknown as Column<DataGridFeatures, DatatableRow>} /> : undefined}
        />
      ),
      enableColumnFilter: !!col.filterType,
      filterFn,
      enablePinning: !!col.pinnable,
      minSize: col.widthMin,
      maxSize: col.widthMax,
      // The last visible column grows to soak up any space left over once
      // the table's own column widths are totaled -- otherwise that space
      // sits as dead blank filler (DataGridTableFillCol) instead of being
      // put to use, most noticeably right after a column is hidden (see
      // PanelNode.hidden) and its width is freed up.
      meta: index === cols.length - 1 ? { autoSize: true } : undefined,
      cell: ({ row, getValue }) => {
        const value = getValue()
        const content = renderCellContent(value, col)
        const inner =
          options?.treeToggle && index === 0 ? (
            <span className="inline-flex items-center gap-1">
              <DataGridTableRowExpand row={row} />
              {content}
            </span>
          ) : (
            content
          )
        // Only touches layout (block/w-full, so the flash/color-scale has a
        // full-width box to color rather than just hugging the text) when
        // either feature is actually in play for this cell -- a table with
        // both off keeps its exact pre-existing inline/alignStyle-only cell
        // markup. transition-colors alone (no separate "flash" class/
        // keyframes) does the fade: the flash color class is only present
        // while this cell's key is in changedCells, so its removal a beat
        // later animates back to transparent instead of snapping (and, on a
        // color-scaled column, back to the persistent scale color below
        // rather than fully transparent).
        const signalEnabled = options?.changedCells !== undefined
        const direction = options?.changedCells?.get(`${(row.original as DatatableRow).id}::${path}`)
        // A color scale is a persistent inline background, which would
        // otherwise always sit on top of (and hide) the flash's own
        // background class -- skip it for the instant a cell is actually
        // flashing so the flash still shows, reverting to the scale color
        // once diffChangedCells' timeout clears.
        const scaleStyle = direction ? undefined : colorScaleStyle(value, col, options?.colorScaleDomains?.get(col.id))
        const needsColorBox = signalEnabled || !!scaleStyle
        const colorBoxClass = needsColorBox
          ? `block w-full transition-colors duration-1000 ${direction ? signalFlashClass(direction, options?.signalMode ?? 'neutral') : ''}`
          : undefined
        // Precedence: a hand-typed Style can override Align (e.g. its own
        // text-align), but Color scale's computed background always wins
        // over a stray background/background-color in Style -- so the two
        // computed features (this and the signal flash above) can't be
        // silently defeated by an unrelated Style string.
        const cellStyle = { ...alignStyle(col.align), ...parseCssText(col.style ?? ''), ...scaleStyle }
        if (!clickable)
          return (
            <span className={colorBoxClass} style={cellStyle}>
              {inner}
            </span>
          )
        return (
          <button
            type="button"
            className={['text-primary hover:underline', colorBoxClass].filter(Boolean).join(' ')}
            style={cellStyle}
            onClick={() => options!.onLinkedCellClick!(col, value, row.original)}
          >
            {inner}
          </button>
        )
      },
    }
  })
}

/** Transpose mode shows at most this many source rows (as columns) -- the grid isn't virtualized. */
export const TRANSPOSE_MAX_ROWS = 10

const TRANSPOSE_COL_KEY = '__col'
const TRANSPOSE_LABEL_KEY = '__label'
const TRANSPOSE_SOURCE_KEY = '__sourceRows'

/**
 * Display-only transpose: one output row per visible source column, one
 * value column (`r0..rN`) per source row, capped at TRANSPOSE_MAX_ROWS.
 * Each output row remembers its source column def so the cell renderer keeps
 * that column's own dataType/format/humanReadable/align.
 */
export function transposeRows(rows: DatatableRow[], columns: PanelNode[] | undefined): DatatableRow[] {
  const source = rows.slice(0, TRANSPOSE_MAX_ROWS)
  const defs: PanelNode[] = columns?.length
    ? columns.filter((c) => !c.hidden)
    : Object.keys(rows[0] ?? {})
        .filter((key) => key !== 'id' && key !== 'subRows')
        .map((field) => ({ id: field, type: 'datatable-column', field }))
  return defs.map((col) => {
    const path = col.field || ''
    const out: DatatableRow = {
      id: col.id,
      [TRANSPOSE_LABEL_KEY]: col.fieldDisplay || col.field || path,
      [TRANSPOSE_COL_KEY]: col,
      [TRANSPOSE_SOURCE_KEY]: source,
    }
    source.forEach((row, i) => {
      out[`r${i}`] = getFieldValue(row, path)
    })
    return out
  })
}

/** Column defs for transposeRows' output: a field-name column, then one per source row headed by `headerField`'s value (or "#n"). */
export function buildTransposedColumns<TData extends DatatableRow = DatatableRow>(
  sourceRows: DatatableRow[],
  headerField: string | undefined,
  onLinkedCellClick?: (col: PanelNode, value: unknown, row: DatatableRow) => void,
): ColumnDef<DataGridFeatures, TData>[] {
  const source = sourceRows.slice(0, TRANSPOSE_MAX_ROWS)
  const labelCol: ColumnDef<DataGridFeatures, TData> = {
    id: TRANSPOSE_LABEL_KEY,
    accessorFn: (row) => (row as Record<string, unknown>)[TRANSPOSE_LABEL_KEY],
    header: ({ column }) => <DataGridColumnHeader column={column} title="" />,
    enableColumnFilter: false,
    cell: ({ getValue }) => <span className="font-medium">{String(getValue() ?? '')}</span>,
  }
  const valueCols = source.map((row, i): ColumnDef<DataGridFeatures, TData> => {
    const headerValue = headerField ? getFieldValue(row, headerField) : undefined
    const title = headerValue == null || headerValue === '' ? `#${i + 1}` : String(headerValue)
    return {
      id: `r${i}`,
      accessorFn: (r) => (r as Record<string, unknown>)[`r${i}`],
      header: ({ column }) => <DataGridColumnHeader column={column} title={title} />,
      enableColumnFilter: false,
      meta: i === source.length - 1 ? { autoSize: true } : undefined,
      cell: ({ row, getValue }) => {
        const col = (row.original as Record<string, unknown>)[TRANSPOSE_COL_KEY] as PanelNode
        const value = getValue()
        const content = renderCellContent(value, col)
        if (!col.parameter || !onLinkedCellClick) return <span style={alignStyle(col.align)}>{content}</span>
        return (
          <button
            type="button"
            className="text-primary hover:underline"
            style={alignStyle(col.align)}
            onClick={() => onLinkedCellClick(col, value, source[i])}
          >
            {content}
          </button>
        )
      },
    }
  })
  return [labelCol, ...valueCols]
}

export type TotalExpression =NonNullable<PanelNode['totalExpession']>

export function computeTotal(rows: DatatableRow[], field: string, expr: TotalExpression): number | null {
  const values = rows.map((r) => Number(getFieldValue(r, field))).filter((n) => !Number.isNaN(n))
  if (values.length === 0) return null
  switch (expr) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
    default:
      return null
  }
}

/** Distinct string values of a field, for 'selector' column filters. */
export function uniqueValues(rows: DatatableRow[], field: string): string[] {
  const set = new Set<string>()
  rows.forEach((r) => {
    const v = getFieldValue(r, field)
    if (v !== null && v !== undefined && v !== '') set.add(String(v))
  })
  return Array.from(set).sort()
}
