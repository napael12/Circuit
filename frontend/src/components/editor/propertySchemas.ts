import type { NodeType } from '../../api/types'

export type FieldType = 'text' | 'number' | 'select' | 'multiselect' | 'multiline' | 'csv' | 'json' | 'checkbox' | 'pagination'

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  options?: string[]
  /** For type=select with dynamic options (the panel's own datastore names), or type=multiselect (the panel's own drilldowns or links, by id -- specs/drilldown.md, specs/link.md). */
  dynamicOptions?: 'datastores' | 'drilldowns' | 'links'
  /** type=select only: label for the always-present "clear this field" option. Defaults to "None". */
  noneLabel?: string
  /** type=checkbox only: how the box renders when the field is unset on the record -- lets a field default to checked instead of the usual unchecked. */
  defaultChecked?: boolean
  help?: string
}

const COMMON: FieldSchema[] = [{ key: 'title', label: 'Title', type: 'text', help: 'May reference ${param}' }]
const WEIGHT: FieldSchema = { key: 'weight', label: 'Weight', type: 'number', help: 'Flex weight among siblings' }
const DATA_BOUND: FieldSchema = { key: 'datastore', label: 'Datastore', type: 'select', dynamicOptions: 'datastores' }

const LAYOUT: FieldSchema[] = [
  ...COMMON,
  { key: 'displayTitle', label: 'Display title', type: 'checkbox', defaultChecked: true },
  WEIGHT,
  { key: 'direction', label: 'Direction', type: 'select', options: ['horizontal', 'vertical'] },
  { key: 'resizable', label: 'Resizable', type: 'checkbox' },
  { key: 'collapsible', label: 'Collapsible', type: 'checkbox', help: 'Adds a collapse toggle to each direct child' },
]

const TAB: FieldSchema[] = [
  { key: 'title', label: 'Title', type: 'text', help: "Used as this tab's label" },
  { key: 'position', label: 'Position', type: 'select', options: ['top', 'bottom', 'left', 'right'] },
  { key: 'tabStyle', label: 'Style', type: 'select', options: ['basic', 'line'] },
]

const DATATABLE: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  DATA_BOUND,
  { key: 'pagination', label: 'Pagination', type: 'pagination', options: ['10', '50', '100', '200', '1000'] },
  { key: 'filter', label: 'Filter', type: 'checkbox' },
  { key: 'footer', label: 'Footer', type: 'checkbox' },
  { key: 'stickyHeader', label: 'Sticky header', type: 'checkbox' },
  { key: 'resizableColumns', label: 'Resizable columns', type: 'checkbox' },
  { key: 'denseLayout', label: 'Dense layout', type: 'checkbox', defaultChecked: true },
  { key: 'stripedRows', label: 'Striped rows', type: 'checkbox' },
  { key: 'movableColumns', label: 'Movable columns', type: 'checkbox', help: 'Adds Move left/right to each column header\'s menu' },
  { key: 'cellLines', label: 'Cell lines', type: 'checkbox' },
  { key: 'signalOnUpdate', label: 'Signal on Update', type: 'checkbox', help: "Dataset must include unique 'id' field" },
  { key: 'treeRows', label: 'Tree rows', type: 'checkbox' },
  { key: 'treeIdField', label: 'Row id field', type: 'text', help: 'treeRows only -- defaults to "id"' },
  { key: 'treeParentField', label: 'Parent id field', type: 'text', help: 'treeRows only -- defaults to "parentId"' },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const DATATABLE_COLUMN: FieldSchema[] = [
  { key: 'field', label: 'Field', type: 'text' },
  { key: 'fieldPath', label: 'Field path', type: 'text', help: 'Dot-path, if different from Field' },
  { key: 'fieldDisplay', label: 'Display name', type: 'text' },
  { key: 'hidden', label: 'Hidden', type: 'checkbox', help: 'Excludes this column from the rendered table' },
  { key: 'dataType', label: 'Data type', type: 'select', options: ['str', 'number', 'datetime', 'date', 'badge'] },
  { key: 'dataFormat', label: 'Format', type: 'text', help: '"0,000.00" for numbers; "yyyy-MM-dd" / "yyyyMMdd HH:mm" for dates' },
  { key: 'widthMin', label: 'Min width', type: 'number' },
  { key: 'widthMax', label: 'Max width', type: 'number' },
  { key: 'align', label: 'Align', type: 'select', options: ['left', 'right', 'middle'] },
  { key: 'parameter', label: 'Sets parameter', type: 'text', help: 'Row click sets this panel parameter' },
  { key: 'filterType', label: 'Filter type', type: 'select', options: ['text', 'selector'], noneLabel: 'No filter' },
  { key: 'style', label: 'Style', type: 'text' },
  { key: 'stylePath', label: 'Style path', type: 'text' },
  { key: 'totalExpession', label: 'Total', type: 'select', options: ['sum', 'avg', 'min', 'max'] },
  { key: 'pinnable', label: 'Pinnable', type: 'checkbox' },
  {
    key: 'groupFunction',
    label: 'Group function',
    type: 'select',
    options: ['value', 'sum', 'min', 'max', 'avg', 'count'],
    noneLabel: 'No grouping',
    help: 'Turns on grouping for the whole table -- exactly one column should be "value" (rows collapse to one per its distinct value); other columns aggregate',
  },
]

const CHART: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  DATA_BOUND,
  { key: 'chartType', label: 'Chart type', type: 'select', options: ['line', 'bar', 'pie'] },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const CHART_COLUMN: FieldSchema[] = [
  { key: 'field', label: 'Field', type: 'text' },
  { key: 'fieldPath', label: 'Field path', type: 'text', help: 'Dot-path, if different from Field' },
  { key: 'fieldDisplay', label: 'Display name', type: 'text' },
  { key: 'dataType', label: 'Data type', type: 'select', options: ['str', 'number', 'date'] },
  { key: 'dataFormat', label: 'Format', type: 'text' },
]

const PIVOT: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  DATA_BOUND,
  { key: 'rowTotals', label: 'Row grand total', type: 'checkbox', help: 'Adds a Grand Total column per value field, aggregating each row across every column' },
  { key: 'columnTotals', label: 'Column grand total', type: 'checkbox', help: 'Adds a Grand Total row, aggregating each column across every row' },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const PIVOT_COLUMN: FieldSchema[] = [
  { key: 'field', label: 'Field', type: 'text' },
  { key: 'fieldPath', label: 'Field path', type: 'text', help: 'Dot-path, if different from Field' },
  { key: 'fieldDisplay', label: 'Display name', type: 'text' },
  {
    key: 'role',
    label: 'Role',
    type: 'select',
    options: ['index', 'column', 'value'],
    help: 'index -> row grouping, column -> column grouping, value -> aggregated cells. Sibling order sets nesting order.',
  },
  { key: 'aggrFunction', label: 'Aggregate function', type: 'select', options: ['sum', 'avg', 'min', 'max', 'count'], help: 'role=value only' },
  { key: 'dataType', label: 'Data type', type: 'select', options: ['str', 'number', 'datetime', 'date'] },
  { key: 'dataFormat', label: 'Format', type: 'text', help: '"0,000.00" for numbers; "yyyy-MM-dd" / "yyyyMMdd HH:mm" for dates' },
  { key: 'sort', label: 'Sort', type: 'select', options: ['none', 'asc', 'desc'], help: 'role=index/column only' },
  {
    key: 'subtotal',
    label: 'Subtotal',
    type: 'checkbox',
    help: 'role=index/column only -- adds a "{value} Total" subtotal row/column after each of this field\'s groups, aggregating every value field across that group',
  },
  {
    key: 'filterType',
    label: 'Filter type',
    type: 'select',
    options: ['text', 'selector'],
    noneLabel: 'No filter',
    help: 'role=index/column only -- filters source rows before pivoting',
  },
]

const SCHEMAS: Record<NodeType, FieldSchema[]> = {
  layout: LAYOUT,
  tab: TAB,
  datatable: DATATABLE,
  'datatable-column': DATATABLE_COLUMN,
  chart: CHART,
  'chart-column': CHART_COLUMN,
  pivot: PIVOT,
  'pivot-column': PIVOT_COLUMN,
}

export function schemaFor(type: NodeType): FieldSchema[] {
  return SCHEMAS[type] ?? []
}

/** Field schema for a panel-level Parameter (specs/control_attributes.md's `parameter:`). */
export const PARAMETER_SCHEMA: FieldSchema[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'defaultValue', label: 'Default value', type: 'text' },
  { key: 'dataType', label: 'Data type', type: 'select', options: ['str', 'number', 'date'] },
  { key: 'hidden', label: 'Hidden', type: 'checkbox', help: 'Still usable, but not shown in the Parameters dialog' },
  {
    key: 'datastore',
    label: 'Options datastore',
    type: 'select',
    dynamicOptions: 'datastores',
    help: "Populates this parameter's picker from the datastore's rows -- a multi-column datastore renders as a lookup table instead of a plain dropdown",
  },
  {
    key: 'selectorColumn',
    label: 'Selector column',
    type: 'text',
    help: 'Options datastore only -- which column supplies the actual value. Blank uses the first column',
  },
]

/** Field schema for a panel-level Link (specs/link.md). */
export const LINK_SCHEMA: FieldSchema[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'url', label: 'URL', type: 'text', help: 'May reference ${param}, e.g. http://url.com/${parameter1}/${parameter2}' },
  { key: 'target', label: 'Opens in', type: 'select', options: ['tab', 'window'] },
]
