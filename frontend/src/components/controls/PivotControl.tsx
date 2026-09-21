import { useMemo, useState } from 'react'
import { Filter } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import type { PanelNode } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { useTitleText } from '../../hooks/useTitleText'
import { downloadCsv, sanitizeFilename } from '../../utils/csv'
import { formatValue, getFieldValue } from '../../utils/panelFormat'
import { buildGroupPlan, buildPivot, pivotToCsv, type GroupPlan, type GroupPlanItem, type PivotFieldDef, type PivotGroupNode } from '../../utils/pivot'
import { usePanelId } from '../layout/ParameterContext'
import { useReactiveDatastoreParams } from '../layout/useComponentParams'
import { ControlContextMenu } from './ControlContextMenu'
import { toRows, type DatatableRow } from './datatableUtils'
import { DatastoreStatusBadge } from './DatastoreStatusBadge'
import type { ControlProps } from './types'

type FilterValue = string | string[]

/** reui's DataGrid isn't virtualized either, and DatatableControl caps unpaginated tables the same way -- see its own comment for why. */
const MAX_PIVOT_ROWS = 500

const CELL_CLASS = 'border border-border px-2 py-1 text-[0.82em] whitespace-nowrap'
const INDEX_BG = 'bg-muted/50'
const HEADER_BG = 'bg-muted'
const TOTAL_BG = 'bg-muted/30 font-semibold'

/** Rows matching every active index/column pivot-column filter (text = substring, selector = OR'd exact match). role=value filters are ignored -- filtering an aggregated cell after the fact doesn't make sense. */
function applyPivotFilters(rows: DatatableRow[], columns: PanelNode[], filters: Record<string, FilterValue>): DatatableRow[] {
  const active = columns.filter((c) => c.filterType && c.role !== 'value' && filters[c.id] !== undefined)
  if (active.length === 0) return rows
  return rows.filter((row) =>
    active.every((col) => {
      const path = col.field || ''
      const value = getFieldValue(row, path)
      const filterValue = filters[col.id]
      if (col.filterType === 'text') return String(value ?? '').toLowerCase().includes(String(filterValue).toLowerCase())
      const selected = Array.isArray(filterValue) ? filterValue : []
      return selected.length === 0 || selected.includes(value == null ? '' : String(value))
    }),
  )
}

/** Distinct raw string values of a field, for a selector filter's option list -- drawn from the full (unfiltered) row set. */
function uniqueValues(rows: DatatableRow[], path: string): string[] {
  const set = new Set<string>()
  rows.forEach((r) => {
    const v = getFieldValue(r, path)
    if (v !== null && v !== undefined && v !== '') set.add(String(v))
  })
  return Array.from(set).sort()
}

function FieldFilter({
  col,
  rows,
  value,
  onChange,
}: {
  col: PanelNode
  rows: DatatableRow[]
  value: FilterValue | undefined
  onChange: (v: FilterValue | undefined) => void
}) {
  if (!col.filterType) return null
  const path = col.field || ''
  const label = col.fieldDisplay || col.field || col.id

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter ${label}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'ml-1 inline-flex align-middle',
            value !== undefined ? 'text-primary' : 'text-muted-foreground/70 hover:text-foreground',
          )}
        >
          <Filter className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 text-left font-normal normal-case" align="start" onClick={(e) => e.stopPropagation()}>
        {col.filterType === 'text' ? (
          <Input
            placeholder={`Filter ${label}`}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className="h-7 text-[0.8em]"
          />
        ) : (
          <SelectorFilter options={uniqueValues(rows, path)} selected={Array.isArray(value) ? value : []} onChange={onChange} />
        )}
      </PopoverContent>
    </Popover>
  )
}

function SelectorFilter({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: string[]
  onChange: (v: FilterValue | undefined) => void
}) {
  const set = new Set(selected)
  const toggle = (opt: string) => {
    const next = new Set(set)
    if (next.has(opt)) next.delete(opt)
    else next.add(opt)
    onChange(next.size ? Array.from(next) : undefined)
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
        {options.map((opt) => (
          <label key={opt} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-[0.8em] font-normal hover:bg-muted">
            <Checkbox checked={set.has(opt)} onCheckedChange={() => toggle(opt)} />
            <span className="truncate">{opt}</span>
          </label>
        ))}
        {options.length === 0 && <div className="px-1 py-1 text-[0.78em] text-muted-foreground">No values.</div>}
      </div>
      {set.size > 0 && (
        <button
          type="button"
          className="mt-0.5 px-1 text-left text-[0.78em] text-muted-foreground hover:text-foreground"
          onClick={() => onChange(undefined)}
        >
          Clear filter
        </button>
      )}
    </div>
  )
}

function groupLabel(node: PivotGroupNode, field: PivotFieldDef): string {
  return formatValue(node.key, field.node.dataType, field.node.dataFormat, field.node.humanReadable)
}

function cellText(value: number | null, field: PivotFieldDef): string {
  return value === null ? '' : formatValue(value, field.node.dataType, field.node.dataFormat, field.node.humanReadable)
}

/**
 * Renders the pivot component type (specs/pivot.md): groups a datastore's
 * rows into nested index (row) and column groups via its pivot-column
 * children, aggregating each role=value column's numbers per cell. A
 * bespoke `<table>`, not the shared reui DataGrid -- merged index/column
 * header cells (rowSpan/colSpan) and a multi-level column header don't map
 * onto that component's flat per-row TanStack column model.
 */
export function PivotControl({ component, datastores, previewMode }: ControlProps) {
  const params = useReactiveDatastoreParams(component.id)
  const panelId = usePanelId()
  const { data, loading, error, refreshMode, lastRunAt, refresh } = useDatastore(
    component.datastore,
    datastores,
    params,
    panelId,
    previewMode,
  )
  const title = useTitleText(component.title)
  const [filters, setFilters] = useState<Record<string, FilterValue>>({})
  const setFilter = (id: string, value: FilterValue | undefined) =>
    setFilters((f) => {
      if (value === undefined) {
        const { [id]: _removed, ...rest } = f
        return rest
      }
      return { ...f, [id]: value }
    })

  const rows = useMemo(() => toRows(data), [data])
  const columns = useMemo(() => component.columns ?? [], [component.columns])
  const filteredRows = useMemo(() => applyPivotFilters(rows, columns, filters), [rows, columns, filters])
  const result = useMemo(() => buildPivot(filteredRows, columns), [filteredRows, columns])

  const { indexFields, columnFields, valueFields, rowTree, columnTree, rowLeaves, columnLeaves } = result
  const rowTotals = !!component.rowTotals && valueFields.length > 0
  const columnTotals = !!component.columnTotals && valueFields.length > 0
  // A column field's own filter icon has nowhere natural to live except on
  // one of its group cells -- putting it on every one would repeat the same
  // control needlessly, so only the level's first (leftmost) node gets it.
  const showValueRow = valueFields.length > 1 || columnFields.length === 0
  const headerRows = columnFields.length + (showValueRow ? 1 : 0)
  // Flat leaf+subtotal rendering sequences (see PanelNode.subtotal / buildGroupPlan)
  // for the row and column axes, each with its own levels' *detail* merged-cell
  // spans measured against that sequence. A field with no subtotal set produces
  // the same leaf-only sequence buildPivot's own rowLeaves/columnLeaves already
  // give -- these just also know where any subtotals go.
  const rowPlan: GroupPlan = useMemo(
    () => (indexFields.length ? buildGroupPlan(rowTree, indexFields) : { items: [{ kind: 'leaf', node: rowLeaves[0] }], levelCells: [] }),
    [indexFields, rowTree, rowLeaves],
  )
  const columnPlan: GroupPlan = useMemo(
    () => (columnFields.length ? buildGroupPlan(columnTree, columnFields) : { items: [{ kind: 'leaf', node: columnLeaves[0] }], levelCells: [] }),
    [columnFields, columnTree, columnLeaves],
  )
  // A high-cardinality index (e.g. one row per movie title) can still produce
  // thousands of leaf rows even after aggregation -- this table isn't
  // virtualized, so rendering all of them can hang the browser. Totals still
  // aggregate over every row regardless (they read straight off the group
  // tree, not this slice). Subtotal rows within the visible window are kept.
  const visibleRowItems = useMemo(() => {
    if (rowLeaves.length <= MAX_PIVOT_ROWS) return rowPlan.items
    const out: GroupPlanItem[] = []
    let leafCount = 0
    for (const item of rowPlan.items) {
      out.push(item)
      if (item.kind === 'leaf' && ++leafCount >= MAX_PIVOT_ROWS) break
    }
    return out
  }, [rowPlan, rowLeaves.length])

  const handleExport = () =>
    downloadCsv(sanitizeFilename(title || component.id), pivotToCsv(result, { rowTotals, columnTotals }))

  if (error) {
    return (
      <ControlContextMenu
        onRefresh={refresh}
        canRefresh={refreshMode === 'on_demand'}
        onExport={handleExport}
        canExport={false}
        onRemoveFilters={() => setFilters({})}
        canRemoveFilters={Object.keys(filters).length > 0}
        drilldownIds={component.drilldownIds}
        linkIds={component.linkIds}
      >
        <div className="h-full w-full">
          <Alert variant="destructive" className="m-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </ControlContextMenu>
    )
  }

  return (
    <ControlContextMenu
      onRefresh={refresh}
      canRefresh={refreshMode === 'on_demand'}
      onExport={handleExport}
      canExport={rows.length > 0}
      onRemoveFilters={() => setFilters({})}
      canRemoveFilters={Object.keys(filters).length > 0}
      drilldownIds={component.drilldownIds}
      linkIds={component.linkIds}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <DatastoreStatusBadge refreshMode={refreshMode} lastRunAt={lastRunAt} />
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          {loading && rows.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <Spinner className="size-6" />
            </div>
          ) : valueFields.length === 0 ? (
            <div className="p-4 text-[0.85em] text-muted-foreground">
              Add at least one pivot-column with role "value" to display data.
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                {columnFields.map((columnField, level) => (
                  <tr key={`level-${level}`}>
                    {level === 0 &&
                      indexFields.map((field) => (
                        <th key={field.node.id} rowSpan={headerRows} className={cn(CELL_CLASS, INDEX_BG, 'align-bottom font-semibold uppercase')}>
                          {field.label}
                          <FieldFilter col={field.node} rows={rows} value={filters[field.node.id]} onChange={(v) => setFilter(field.node.id, v)} />
                        </th>
                      ))}
                    {columnPlan.levelCells[level].flatMap(({ node, span, startIndex }) => {
                      const detailTh = (
                        <th
                          key={node.path.join('|')}
                          colSpan={span * (valueFields.length || 1)}
                          className={cn(CELL_CLASS, HEADER_BG, 'text-center font-semibold')}
                        >
                          {groupLabel(node, columnField)}
                          {startIndex === 0 && (
                            <FieldFilter col={columnField.node} rows={rows} value={filters[columnField.node.id]} onChange={(v) => setFilter(columnField.node.id, v)} />
                          )}
                        </th>
                      )
                      if (!columnField.node.subtotal) return [detailTh]
                      const remainingLevels = columnFields.length - level
                      const subtotalRowSpan = valueFields.length > 1 ? remainingLevels : remainingLevels + (showValueRow ? 1 : 0)
                      return [
                        detailTh,
                        <th
                          key={`${node.path.join('|')}::subtotal`}
                          colSpan={valueFields.length}
                          rowSpan={subtotalRowSpan}
                          className={cn(CELL_CLASS, TOTAL_BG, 'text-center')}
                        >
                          {groupLabel(node, columnField)} Total
                        </th>,
                      ]
                    })}
                    {level === 0 && rowTotals && (
                      <th
                        colSpan={valueFields.length}
                        rowSpan={valueFields.length > 1 ? columnFields.length : headerRows}
                        className={cn(CELL_CLASS, TOTAL_BG, 'text-center')}
                      >
                        Grand Total
                      </th>
                    )}
                  </tr>
                ))}
                {showValueRow && (
                  <tr>
                    {columnFields.length === 0 &&
                      indexFields.map((field) => (
                        <th key={field.node.id} className={cn(CELL_CLASS, INDEX_BG, 'font-semibold uppercase')}>
                          {field.label}
                          <FieldFilter col={field.node} rows={rows} value={filters[field.node.id]} onChange={(v) => setFilter(field.node.id, v)} />
                        </th>
                      ))}
                    {columnPlan.items.flatMap((item) => {
                      // valueFields.length===1 subtotal columns are already
                      // spanned over by their level-header <th> (see
                      // subtotalRowSpan above), so nothing to add here.
                      if (item.kind === 'subtotal' && valueFields.length === 1) return []
                      return valueFields.map((v) => (
                        <th
                          key={`${item.node.path.join('|')}::${item.kind}::${v.node.id}`}
                          className={cn(CELL_CLASS, item.kind === 'subtotal' ? TOTAL_BG : HEADER_BG, 'text-center font-semibold')}
                        >
                          {v.label}
                        </th>
                      ))
                    })}
                    {rowTotals &&
                      (valueFields.length > 1 || columnFields.length === 0) &&
                      valueFields.map((v) => (
                        <th key={`total::${v.node.id}`} className={cn(CELL_CLASS, TOTAL_BG, 'text-center')}>
                          {columnFields.length === 0 ? `Grand Total ${v.label}` : v.label}
                        </th>
                      ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {visibleRowItems.map((item, rowIndex) => {
                  if (item.kind === 'subtotal') {
                    const level = item.level ?? 0
                    return (
                      <tr key={`${item.node.path.join('|')}::subtotal`} className={TOTAL_BG}>
                        <td colSpan={indexFields.length - level} className={cn(CELL_CLASS, TOTAL_BG)}>
                          {groupLabel(item.node, indexFields[level])} Total
                        </td>
                        {columnPlan.items.flatMap((colItem) =>
                          valueFields.map((v) => (
                            <td
                              key={`${colItem.node.path.join('|')}::${colItem.kind}::${v.node.id}`}
                              className={cn(CELL_CLASS, TOTAL_BG, v.node.dataType === 'number' ? 'text-right' : 'text-left')}
                            >
                              {cellText(result.cell(item.node, colItem.node, v), v)}
                            </td>
                          )),
                        )}
                        {rowTotals &&
                          valueFields.map((v) => (
                            <td key={`rowtotal::${v.node.id}`} className={cn(CELL_CLASS, TOTAL_BG, 'text-right')}>
                              {cellText(result.rowTotal(item.node, v), v)}
                            </td>
                          ))}
                      </tr>
                    )
                  }
                  const rowLeaf = item.node
                  return (
                    <tr key={rowLeaf.path.join('') || rowIndex}>
                      {indexFields.map((field, level) => {
                        const cell = rowPlan.levelCells[level].find((c) => c.startIndex === rowIndex)
                        if (!cell) return null
                        return (
                          <td key={field.node.id} rowSpan={cell.span} className={cn(CELL_CLASS, INDEX_BG, 'align-top')}>
                            {groupLabel(cell.node, field)}
                          </td>
                        )
                      })}
                      {columnPlan.items.flatMap((colItem) =>
                        valueFields.map((v) => (
                          <td
                            key={`${colItem.node.path.join('|')}::${colItem.kind}::${v.node.id}`}
                            className={cn(CELL_CLASS, colItem.kind === 'subtotal' && TOTAL_BG, v.node.dataType === 'number' ? 'text-right' : 'text-left')}
                          >
                            {cellText(result.cell(rowLeaf, colItem.node, v), v)}
                          </td>
                        )),
                      )}
                      {rowTotals &&
                        valueFields.map((v) => (
                          <td key={`rowtotal::${v.node.id}`} className={cn(CELL_CLASS, TOTAL_BG, 'text-right')}>
                            {cellText(result.rowTotal(rowLeaf, v), v)}
                          </td>
                        ))}
                    </tr>
                  )
                })}
              </tbody>
              {columnTotals && (
                <tfoot>
                  <tr>
                    {indexFields.length > 0 && (
                      <td colSpan={indexFields.length} className={cn(CELL_CLASS, TOTAL_BG)}>
                        Grand Total
                      </td>
                    )}
                    {columnPlan.items.flatMap((item) =>
                      valueFields.map((v) => (
                        <td
                          key={`coltotal::${item.node.path.join('|')}::${item.kind}::${v.node.id}`}
                          className={cn(CELL_CLASS, TOTAL_BG, 'text-right')}
                        >
                          {cellText(result.columnTotal(item.node, v), v)}
                        </td>
                      )),
                    )}
                    {rowTotals &&
                      valueFields.map((v) => (
                        <td key={`grandtotal::${v.node.id}`} className={cn(CELL_CLASS, TOTAL_BG, 'text-right')}>
                          {cellText(result.grandTotal(v), v)}
                        </td>
                      ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
        {rowLeaves.length > MAX_PIVOT_ROWS && (
          <div className="flex-none border-t border-border px-2 py-1 text-[0.78em] text-muted-foreground">
            Showing {MAX_PIVOT_ROWS} of {rowLeaves.length} rows -- narrow the index or add a filter to see the rest. Totals still
            reflect every row.
          </div>
        )}
      </div>
    </ControlContextMenu>
  )
}
