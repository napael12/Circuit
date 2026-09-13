// Pivot-table computation (specs/pivot.md): groups datastore rows by one or
// more `role=index` pivot-columns (nested row groups) crossed with one or
// more `role=column` pivot-columns (nested column groups), aggregating each
// `role=value` pivot-column's numbers per (row-group, column-group) cell.
//
// Deliberately its own bespoke engine rather than reusing DatatableControl's
// TanStack-table pipeline: a pivot's merged index/column header cells
// (rowSpan/colSpan) and multi-level column headers don't map onto TanStack's
// flat per-row column model.

import type { PanelNode } from '../api/types'
import { gridToCsv } from './csv'
import { formatValue, getFieldValue } from './panelFormat'

export type DatatableRow = Record<string, unknown> & { id: string | number }
export type AggrFn = NonNullable<PanelNode['aggrFunction']>

/** A resolved role=index/role=column/role=value pivot-column, with its field path pre-extracted. */
export interface PivotFieldDef {
  node: PanelNode
  path: string
  label: string
}

export function toFieldDef(node: PanelNode): PivotFieldDef {
  return { node, path: node.fieldPath || node.field || '', label: node.fieldDisplay || node.field || node.id }
}

export function aggregate(values: number[], fn: AggrFn): number | null {
  if (fn === 'count') return values.length
  if (values.length === 0) return null
  switch (fn) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
  }
}

function numbersOf(rows: DatatableRow[], path: string): number[] {
  return rows.map((r) => Number(getFieldValue(r, path))).filter((n) => !Number.isNaN(n))
}

/** One distinct value's node within a nested index/column group tree. */
export interface PivotGroupNode {
  key: string
  label: string
  /** Leaf-column/leaf-row count this node spans -- the rowSpan/colSpan a merged header/index cell needs. */
  span: number
  /** This node's key plus every ancestor's key, root-first -- what a cell needs to match a column-group leaf against. */
  path: string[]
  children?: PivotGroupNode[]
  /** Every source row under this node (its own bucket plus every descendant's) -- what totals aggregate over. */
  rows: DatatableRow[]
}

function keyOf(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function sortedKeys(keys: string[], field: PivotFieldDef): string[] {
  const sort = field.node.sort ?? 'none'
  if (sort === 'none') return keys
  const isNumeric = field.node.dataType === 'number'
  const compare = isNumeric
    ? (a: string, b: string) => Number(a) - Number(b)
    : (a: string, b: string) => a.localeCompare(b)
  const sorted = keys.slice().sort(compare)
  return sort === 'desc' ? sorted.reverse() : sorted
}

/** Recursively groups `rows` by `fields[level..]`, building the nested tree one level buys. */
function buildGroups(rows: DatatableRow[], fields: PivotFieldDef[], level: number, parentPath: string[]): PivotGroupNode[] {
  const field = fields[level]
  const buckets = new Map<string, DatatableRow[]>()
  for (const row of rows) {
    const key = keyOf(getFieldValue(row, field.path))
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  }
  const keys = sortedKeys(Array.from(buckets.keys()), field)
  return keys.map((key) => {
    const bucketRows = buckets.get(key)!
    const path = [...parentPath, key]
    const children = level + 1 < fields.length ? buildGroups(bucketRows, fields, level + 1, path) : undefined
    const span = children ? Math.max(1, children.reduce((s, c) => s + c.span, 0)) : 1
    return { key, label: key, span, path, children, rows: bucketRows }
  })
}

export function leavesOf(nodes: PivotGroupNode[]): PivotGroupNode[] {
  return nodes.flatMap((n) => (n.children ? leavesOf(n.children) : [n]))
}

/** Every node at a given depth of a group tree, in left-to-right order -- one header `<tr>`'s worth of cells. */
export function nodesAtLevel(nodes: PivotGroupNode[], level: number): PivotGroupNode[] {
  if (level === 0) return nodes
  return nodesAtLevel(
    nodes.flatMap((n) => n.children ?? []),
    level - 1,
  )
}

export interface LevelCell {
  node: PivotGroupNode
  /** This node's offset among its level's total leaf span -- the row/column index a merged header or index cell should actually render at (every other index within its span renders nothing, covered by this cell's rowSpan/colSpan). */
  startIndex: number
  span: number
}

export function levelCells(tree: PivotGroupNode[], level: number): LevelCell[] {
  const nodes = nodesAtLevel(tree, level)
  let offset = 0
  return nodes.map((node) => {
    const cell: LevelCell = { node, startIndex: offset, span: node.span }
    offset += node.span
    return cell
  })
}

/** One position in a group plan's flat, rendering-order sequence -- either a real leaf group or a synthetic subtotal inserted after one field's group (PanelNode.subtotal). */
export interface GroupPlanItem {
  kind: 'leaf' | 'subtotal'
  node: PivotGroupNode
  /** subtotal items only -- which field (index into the plan's own `fields` array) this subtotal aggregates. */
  level?: number
}

export interface GroupPlan {
  /** Flat, rendering-order sequence of leaves and subtotals -- one row (row plan) or one value-field-group's worth of columns (column plan) per item. */
  items: GroupPlanItem[]
  /**
   * Per level, the *detail* merged header/index cells (same shape/meaning as
   * `levelCells`, but span/startIndex are measured in `items` positions --
   * i.e. they already account for any subtotal items nested inside, but
   * exclude the node's own subtotal item, which renders as a separate,
   * unmerged entry right after).
   */
  levelCells: LevelCell[][]
}

/**
 * Walks a group tree once, producing the flat leaf+subtotal sequence a
 * subtotal-aware row/column renders in, along with each level's *detail*
 * merged-cell spans measured against that same flat sequence (so a merged
 * index/column-group cell's rowSpan/colSpan stays correct once subtotal
 * rows/columns are interspersed). See PanelNode.subtotal.
 */
export function buildGroupPlan(tree: PivotGroupNode[], fields: PivotFieldDef[]): GroupPlan {
  const items: GroupPlanItem[] = []
  const levelCells: LevelCell[][] = fields.map(() => [])

  function visit(node: PivotGroupNode, level: number): void {
    const startIndex = items.length
    if (node.children) {
      for (const child of node.children) visit(child, level + 1)
    } else {
      items.push({ kind: 'leaf', node })
    }
    const span = items.length - startIndex
    levelCells[level].push({ node, startIndex, span })
    if (fields[level].node.subtotal) {
      items.push({ kind: 'subtotal', node, level })
    }
  }

  for (const root of tree) visit(root, 0)
  return { items, levelCells }
}

export interface PivotResult {
  indexFields: PivotFieldDef[]
  columnFields: PivotFieldDef[]
  valueFields: PivotFieldDef[]
  /** Nested row-group tree (empty when there are no role=index columns -- a single implicit root row). */
  rowTree: PivotGroupNode[]
  /** Nested column-group tree (empty when there are no role=column columns -- values render flat). */
  columnTree: PivotGroupNode[]
  rowLeaves: PivotGroupNode[]
  columnLeaves: PivotGroupNode[]
  /** Aggregated value for one (row leaf, column leaf, value field) cell. */
  cell: (rowLeaf: PivotGroupNode, columnLeaf: PivotGroupNode, value: PivotFieldDef) => number | null
  /** That row leaf's aggregate across every column (rowTotals). */
  rowTotal: (rowLeaf: PivotGroupNode, value: PivotFieldDef) => number | null
  /** That column leaf's aggregate across every row (columnTotals). */
  columnTotal: (columnLeaf: PivotGroupNode, value: PivotFieldDef) => number | null
  /** Aggregate across every row and column. */
  grandTotal: (value: PivotFieldDef) => number | null
}

/** Builds the full pivot structure from already-filtered source rows and the pivot's own pivot-column children. */
export function buildPivot(rows: DatatableRow[], columns: PanelNode[]): PivotResult {
  const indexFields = columns.filter((c) => c.role === 'index').map(toFieldDef)
  const columnFields = columns.filter((c) => c.role === 'column').map(toFieldDef)
  const valueFields = columns.filter((c) => (c.role ?? 'value') === 'value').map(toFieldDef)

  const rowTree = indexFields.length ? buildGroups(rows, indexFields, 0, []) : []
  const columnTree = columnFields.length ? buildGroups(rows, columnFields, 0, []) : []
  const rowLeaves = indexFields.length ? leavesOf(rowTree) : [{ key: '', label: '', span: 1, path: [], rows }]
  const columnLeaves = columnFields.length ? leavesOf(columnTree) : [{ key: '', label: '', span: 1, path: [], rows }]

  // Matches against columnLeaf.path's own length, not columnFields' full
  // length -- a leaf's path is always full-depth, but a subtotal's group
  // node (see buildGroupPlan/PanelNode.subtotal) has a *partial* path
  // (only the levels up to and including its own), and should aggregate
  // every row nested under it regardless of deeper column-field values.
  const cellRows = (rowLeaf: PivotGroupNode, columnLeaf: PivotGroupNode): DatatableRow[] => {
    if (columnLeaf.path.length === 0) return rowLeaf.rows
    return rowLeaf.rows.filter((row) => columnLeaf.path.every((key, i) => keyOf(getFieldValue(row, columnFields[i].path)) === key))
  }

  return {
    indexFields,
    columnFields,
    valueFields,
    rowTree,
    columnTree,
    rowLeaves,
    columnLeaves,
    cell: (rowLeaf, columnLeaf, value) => {
      const fn = value.node.aggrFunction ?? 'sum'
      return aggregate(numbersOf(cellRows(rowLeaf, columnLeaf), value.path), fn)
    },
    rowTotal: (rowLeaf, value) => aggregate(numbersOf(rowLeaf.rows, value.path), value.node.aggrFunction ?? 'sum'),
    columnTotal: (columnLeaf, value) => aggregate(numbersOf(columnLeaf.rows, value.path), value.node.aggrFunction ?? 'sum'),
    grandTotal: (value) => aggregate(numbersOf(rows, value.path), value.node.aggrFunction ?? 'sum'),
  }
}

/**
 * Flattens a pivot to CSV. CSV has no real merged cells, so rather than
 * approximate the rendered table's multi-row rowSpan/colSpan header, each
 * rendered column gets a single combined header label (its full column-group
 * path plus the value field name, e.g. "2009 Revenue") -- the common,
 * spreadsheet-friendly way to flatten a pivot table. Per-field subtotals
 * (PanelNode.subtotal) render as their own extra row/column, labeled
 * "{value} Total"; the pivot-level rowTotals/columnTotals grand total
 * renders as "Grand Total" to keep the two kinds visually distinct.
 */
export function pivotToCsv(result: PivotResult, options: { rowTotals?: boolean; columnTotals?: boolean }): string {
  const { indexFields, columnFields, valueFields, rowTree, columnTree, rowLeaves, columnLeaves } = result
  const fmt = (value: number | null, field: PivotFieldDef) => formatValue(value, field.node.dataType, field.node.dataFormat)

  const rowPlan: GroupPlan = indexFields.length ? buildGroupPlan(rowTree, indexFields) : { items: [{ kind: 'leaf', node: rowLeaves[0] }], levelCells: [] }
  const columnPlan: GroupPlan = columnFields.length
    ? buildGroupPlan(columnTree, columnFields)
    : { items: [{ kind: 'leaf', node: columnLeaves[0] }], levelCells: [] }

  const columnLabel = (item: GroupPlanItem, value: PivotFieldDef) => {
    const base = item.node.path.length ? `${item.node.path.join(' ')} ${value.label}` : value.label
    return item.kind === 'subtotal' ? `${base} Total` : base
  }

  const grid: unknown[][] = [
    [
      ...indexFields.map((f) => f.label),
      ...columnPlan.items.flatMap((item) => valueFields.map((v) => columnLabel(item, v))),
      ...(options.rowTotals ? valueFields.map((v) => `Grand Total ${v.label}`) : []),
    ],
  ]

  for (const item of rowPlan.items) {
    const rowNode = item.node
    const level = item.level ?? 0
    const indexCells = indexFields.map((f, i) => {
      if (item.kind === 'leaf' || i < level) return formatValue(rowNode.path[i], f.node.dataType, f.node.dataFormat)
      if (i === level) return `${formatValue(rowNode.path[i], f.node.dataType, f.node.dataFormat)} Total`
      return ''
    })
    grid.push([
      ...indexCells,
      ...columnPlan.items.flatMap((colItem) => valueFields.map((v) => fmt(result.cell(rowNode, colItem.node, v), v))),
      ...(options.rowTotals ? valueFields.map((v) => fmt(result.rowTotal(rowNode, v), v)) : []),
    ])
  }

  if (options.columnTotals) {
    grid.push([
      'Grand Total',
      ...indexFields.slice(1).map(() => ''),
      ...columnPlan.items.flatMap((item) => valueFields.map((v) => fmt(result.columnTotal(item.node, v), v))),
      ...(options.rowTotals ? valueFields.map((v) => fmt(result.grandTotal(v), v)) : []),
    ])
  }

  return gridToCsv(grid)
}
