import { useEffect, useMemo, useRef, useState } from 'react'
import { useTable } from '@tanstack/react-table'

import { Alert, AlertDescription } from '@/components/ui/alert'

import { DataGrid, dataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridPagination } from '../reui/data-grid/data-grid-pagination'
import { DataGridScrollArea } from '../reui/data-grid/data-grid-scroll-area'
import { DataGridTable, DataGridTableFootRow, DataGridTableFootRowCell } from '../reui/data-grid/data-grid-table'
import type { PanelNode } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { useTitleText } from '../../hooks/useTitleText'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'
import { formatValue, getFieldValue } from '../../utils/panelFormat'
import { usePanelId, useSetParameter } from '../layout/ParameterContext'
import { useReactiveDatastoreParams } from '../layout/useComponentParams'
import { ControlContextMenu } from './ControlContextMenu'
import { DatastoreStatusBadge } from './DatastoreStatusBadge'
import {
  alignStyle,
  buildColumns,
  buildTransposedColumns,
  buildTreeRows,
  computeTotal,
  diffChangedCells,
  GROUP_ROW_KEY,
  groupRows,
  toRows,
  transposeRows,
  type ColorScaleDomains,
  type DatatableRow,
  type SignalDirection,
} from './datatableUtils'
import type { ControlProps } from './types'

/**
 * Rows per page, or 0 for "no pagination". Tolerates the old boolean
 * `pagination` shape (pre-dropdown: true/false) still present in
 * already-saved panels -- true -> the old implied page size of 10.
 */
function pageSizeOf(pagination: unknown): number {
  if (pagination === true) return 10
  return typeof pagination === 'number' ? pagination : 0
}

/** How long a changed cell's flash background stays visible before fading out (see useChangedCells). */
const SIGNAL_FLASH_MS = 1200

/**
 * `Signal on Update` (PanelNode.signalOnUpdate): re-diffs `rows` against the
 * previous render's rows every time they change, and holds the resulting
 * `${id}::${path}` change set for SIGNAL_FLASH_MS before clearing it back to
 * empty -- datatableUtils' cell renderer fades a cell's background out over
 * that same window via `transition-colors`, so clearing the set (rather than
 * removing a "flashing" class outright) is what makes the fade visible
 * instead of an instant snap. Returns undefined while the feature is off, so
 * buildColumns can tell "disabled" apart from "enabled, nothing changed yet"
 * (see its own `changedCells` doc comment).
 */
function useChangedCells(rows: DatatableRow[], columns: PanelNode[], enabled: boolean): Map<string, SignalDirection> | undefined {
  const prevRowsRef = useRef<DatatableRow[] | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [changed, setChanged] = useState<Map<string, SignalDirection>>(new Map())

  useEffect(() => {
    if (!enabled) {
      prevRowsRef.current = null
      return
    }
    const prev = prevRowsRef.current
    prevRowsRef.current = rows
    if (!prev) return // first load for this table -- nothing to compare against yet
    const next = diffChangedCells(prev, rows, columns)
    if (next.size === 0) return
    setChanged(next)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setChanged(new Map()), SIGNAL_FLASH_MS)
  }, [rows, columns, enabled])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  return enabled ? changed : undefined
}

/** Renders the datatable component type (specs/control_attributes.md) -- columns, tree rows, pagination, filtering, footer totals, and row-click-to-parameter are all driven by the node's own attributes. */
export function DatatableControl({ component, datastores, previewMode }: ControlProps) {
  const params = useReactiveDatastoreParams(component.id)
  const panelId = usePanelId()
  const setParameter = useSetParameter()
  const { data, loading, error, refreshMode, lastRunAt, refresh } = useDatastore(
    component.datastore,
    datastores,
    params,
    panelId,
    previewMode,
  )
  const title = useTitleText(component.title)

  const rows = useMemo(() => toRows(data), [data])
  // Transpose is display-only (capped to TRANSPOSE_MAX_ROWS source rows) and
  // opts out of tree rows, grouping, footer totals, filters, pagination and
  // Signal on Update -- each of those assumes the un-transposed row shape.
  const transpose = !!component.transpose
  const treeMode = !transpose && !!component.treeRows
  // `true` is legacy shorthand (a dashboard saved before the directional
  // modes existed) for what's now written as the explicit 'neutral' mode.
  const signalMode = component.signalOnUpdate === true ? 'neutral' : component.signalOnUpdate
  const changedCells = useChangedCells(rows, component.columns ?? [], !!signalMode && !transpose)
  const isGrouped = useMemo(
    () => !transpose && (component.columns ?? []).some((c) => c.groupFunction === 'value'),
    [transpose, component.columns],
  )
  // A column with groupFunction='value' turns `rows` into one collapsible
  // group-header row per its distinct value (each with the real, un-touched
  // matching rows nested as `subRows`), aggregating every other
  // groupFunction column across the group -- a no-op array (same reference
  // back) when no column has groupFunction='value' set, so this costs
  // nothing for an ungrouped table.
  const groupedRows = useMemo(() => groupRows(rows, component.columns ?? []), [rows, component.columns])
  // CSV export always dumps the real, ungrouped/untreed records -- grouping
  // and tree-nesting are display-only, so exported rows aren't collapsed
  // into aggregates or nested under a parent.
  const handleExport = () => downloadCsv(sanitizeFilename(title || component.id), rowsToCsv(rows, component.columns))
  const idField = component.treeIdField ?? 'id'
  const parentField = component.treeParentField ?? 'parentId'
  const treeRows: DatatableRow[] = useMemo(() => {
    if (transpose) return transposeRows(rows, component.columns)
    if (isGrouped) return groupedRows
    return treeMode ? buildTreeRows(rows, idField, parentField) : rows
  }, [transpose, component.columns, isGrouped, groupedRows, treeMode, rows, idField, parentField])

  // Excludes `hidden` columns from everything the grid actually renders
  // (header/cells/footer) -- CSV export still uses component.columns as-is,
  // so a column hidden from the on-screen table is still exportable.
  const visibleColumns = useMemo(() => (component.columns ?? []).filter((c) => !c.hidden), [component.columns])

  // PanelNode.colorScale: each scaled column's min/max, from its own
  // colorScaleMin/Max when set, else the lowest/highest numeric value among
  // *all* currently loaded rows (not just filtered-to-visible ones, so the
  // color of a given value doesn't shift as someone types into a column
  // filter) -- undefined for a non-numeric value, so those never affect the
  // range. A column left with no numeric value loaded yet gets no entry
  // (colorScaleStyle then renders it uncolored rather than picking an
  // arbitrary domain).
  const colorScaleDomains = useMemo<ColorScaleDomains>(() => {
    const domains: ColorScaleDomains = new Map()
    for (const col of visibleColumns) {
      if (!col.colorScale || col.colorScale === 'none' || col.dataType !== 'number' || !col.field) continue
      let min = col.colorScaleMin
      let max = col.colorScaleMax
      if (min === undefined || max === undefined) {
        let computedMin = Infinity
        let computedMax = -Infinity
        for (const row of rows) {
          const raw = getFieldValue(row, col.field)
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw))
          if (!Number.isFinite(num)) continue
          if (num < computedMin) computedMin = num
          if (num > computedMax) computedMax = num
        }
        if (min === undefined) min = computedMin
        if (max === undefined) max = computedMax
      }
      if (Number.isFinite(min) && Number.isFinite(max)) domains.set(col.id, { min, max })
    }
    return domains
  }, [visibleColumns, rows])

  const columns = useMemo(() => {
    const onLinkedCellClick = (col: PanelNode, value: unknown) =>
      setParameter(col.parameter!, value == null ? '' : String(value), component.id)
    if (transpose) return buildTransposedColumns(rows, component.transposeHeaderField, onLinkedCellClick)
    return buildColumns(component.columns, rows, {
      treeToggle: treeMode || isGrouped,
      onLinkedCellClick,
      filterEnabled: component.filter,
      changedCells,
      signalMode: signalMode || undefined,
      colorScaleDomains,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    transpose,
    component.transposeHeaderField,
    component.columns,
    rows,
    treeMode,
    isGrouped,
    component.id,
    component.filter,
    changedCells,
    signalMode,
    colorScaleDomains,
  ])

  // A hidden column can still drive its `parameter` -- buildColumns leaves
  // it out of the rendered grid entirely (see visibleColumns above), so
  // there's no cell of its own left to click. The whole row becomes the
  // click target instead: clicking anywhere in it sets every hidden,
  // parameter-linked column's value from that row, same as clicking one of
  // those columns' own cells would if it weren't hidden.
  const hiddenLinkedColumns = useMemo(
    () => (component.columns ?? []).filter((c) => c.hidden && c.parameter),
    [component.columns],
  )
  const handleRowClick =
    !transpose && hiddenLinkedColumns.length > 0
      ? (row: DatatableRow) => {
          if (GROUP_ROW_KEY in row) return // group header rows aggregate real rows -- no single value to read
          hiddenLinkedColumns.forEach((col) => {
            const path = col.field || ''
            const value = getFieldValue(row, path)
            setParameter(col.parameter!, value == null ? '' : String(value), component.id)
          })
        }
      : undefined

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: treeRows,
    // Only trust the data's own id field where it's structurally required
    // to be unique (treeRows' parent/child linkage) or is one we stamped
    // ourselves (a group header's GROUP_ROW_KEY). For every other row --
    // plain flat rows, and a grouped table's own leaf/subRows -- fall back
    // to TanStack's own default index-based scheme (index, or
    // `${parent.id}.${index}` when nested) rather than an arbitrary data
    // field: an external dataset's "id" column isn't guaranteed to be
    // unique per row (e.g. a REST API keying credits by person id, where
    // one person has multiple credits), and reusing a non-unique value as
    // row identity corrupts TanStack's row/pagination model on refetch.
    getRowId: (row, index, parent) => {
      const r = row as DatatableRow
      if (GROUP_ROW_KEY in r) return String(r[GROUP_ROW_KEY])
      if (transpose) return String(r.id)
      if (treeMode) return String(r[idField])
      return parent ? `${parent.id}.${index}` : String(index)
    },
    getSubRows: treeMode || isGrouped ? (row) => (row as { subRows?: DatatableRow[] }).subRows : undefined,
    // TanStack defaults to flattening expanded sub rows into the paginated
    // row model, which would both mis-total the page count against the
    // top-level record count we show (recordCount prop below) and can split
    // a group/tree parent's children across a page boundary. Pagination
    // should page through top-level rows only -- expanding one just reveals
    // more content on the same page.
    paginateExpandedRows: false,
    initialState: {
      expanded: true,
      // A fixed pageSize when pagination isn't requested -- NOT derived from
      // rows.length, which would still be 0 (data hasn't loaded yet) on the
      // very first render this initialState applies to. Capped well below
      // "unlimited": reui's DataGrid isn't virtualized, so rendering every
      // row of a large, unpaginated datastore result straight into the DOM
      // can hang the browser for several seconds.
      pagination: { pageIndex: 0, pageSize: (transpose ? 0 : pageSizeOf(component.pagination)) || 500 },
    },
  })

  const hasTotalColumn = !transpose && !!component.footer && visibleColumns.some((c) => c.totalExpession)
  // Filtered, not raw, so totals and the pagination record count both track
  // the table's own column-filter state (table.state.columnFilters) instead
  // of the full unfiltered fetch -- flatRows so a treeRows table's totals
  // still cover nested rows, not just the top-level ones. Group-header rows
  // are excluded: they already hold an *aggregate* of their subRows, so
  // summing them alongside their own children would double-count.
  const filteredRows = table
    .getFilteredRowModel()
    .flatRows.map((r) => r.original as DatatableRow)
    .filter((r) => !(GROUP_ROW_KEY in r))
  const filteredRecordCount = table.getFilteredRowModel().rows.length

  if (error) {
    return (
      <ControlContextMenu
        onRefresh={refresh}
        canRefresh={refreshMode === 'on_demand'}
        onExport={handleExport}
        canExport={false}
        onRemoveFilters={() => table.resetColumnFilters()}
        canRemoveFilters={table.state.columnFilters.length > 0}
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
      onRemoveFilters={() => table.resetColumnFilters()}
      canRemoveFilters={table.state.columnFilters.length > 0}
      drilldownIds={component.drilldownIds}
      linkIds={component.linkIds}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <DatastoreStatusBadge refreshMode={refreshMode} lastRunAt={lastRunAt} />
        <DataGrid
          table={table}
          recordCount={filteredRecordCount}
          isLoading={loading}
          onRowClick={handleRowClick}
          tableLayout={{
            // Undefined/unset behaves as checked -- this control was
            // unconditionally dense before denseLayout existed, and existing
            // saved panels shouldn't change appearance just because the
            // field is now present.
            dense: component.denseLayout !== false,
            cellBorder: !!component.cellLines,
            headerSticky: !!component.stickyHeader,
            footerSticky: true,
            columnsPinnable: visibleColumns.some((c) => c.pinnable),
            // Off by default (component.resizableColumns, unchecked): the
            // table renders `table-fixed w-full`, so its columns divide up
            // exactly the container's own width -- extra/wide columns get
            // squeezed thinner rather than ever producing real overflow to
            // scroll to. Checking it switches to the one mode that gives the
            // table an explicit `width: sum(column sizes)` instead, letting
            // it genuinely exceed the container (DataGridScrollArea's
            // scrollbar) in exchange for per-column drag-to-resize handles.
            columnsResizable: !!component.resizableColumns,
            stripped: !!component.stripedRows,
            // Adds Move left/right to each column header's own dropdown --
            // lighter-weight than a full drag-and-drop reorder, and reuses
            // columnOrderingFeature, already registered on dataGridFeatures.
            columnsMovable: !!component.movableColumns,
          }}
        >
          <div className="flex min-h-0 min-w-0 flex-1">
            {/* DataGridContainer's plain overflow-x-auto is scrollable but
                relies on the OS/browser's own scrollbar, which some
                platforms hide until actively scrolling -- there was then no
                visible sign a datatable had columns cut off. This renders
                real, always-visible thumb/track elements instead.
                This wrapper must itself be a flex container: DataGridScrollArea's
                own root div has no explicit height, so it needs to be
                *stretched* by a flex parent (the default cross-axis
                behavior) to get a definite height at all -- h-full alone
                (a plain block wrapper) leaves that inner div at height:auto,
                so it grows to the content's full height instead of
                clipping/scrolling it. min-w-0 is the width-axis half of the
                same problem: a flex item's default min-width is auto (its
                content's intrinsic width), so the 1500px+ table inside would
                otherwise force this whole flex chain wider than the actual
                container instead of ever overflowing/scrolling within it. */}
            <DataGridScrollArea orientation="both" className="h-full">
              <DataGridTable
                footerContent={hasTotalColumn ? <FooterRow columns={visibleColumns} rows={filteredRows} /> : undefined}
                renderHeader={!component.hideHeader}
              />
            </DataGridScrollArea>
          </div>
          {!transpose && pageSizeOf(component.pagination) > 0 && (
            <div className="flex-none border-t border-border p-1.5">
              <DataGridPagination />
            </div>
          )}
        </DataGrid>
      </div>
    </ControlContextMenu>
  )
}

function FooterRow({ columns, rows }: { columns: PanelNode[]; rows: DatatableRow[] }) {
  return (
    <DataGridTableFootRow>
      {columns.map((col) => {
        const path = col.field || ''
        const total = col.totalExpession ? computeTotal(rows, path, col.totalExpession) : null
        return (
          <DataGridTableFootRowCell key={col.id}>
            <span style={alignStyle(col.align)}>{total !== null ? formatValue(total, col.dataType, col.dataFormat, col.humanReadable) : ''}</span>
          </DataGridTableFootRowCell>
        )
      })}
    </DataGridTableFootRow>
  )
}
