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
const WEIGHT: FieldSchema = {
  key: 'weight',
  label: 'Weight',
  type: 'number',
  help: "Flex weight among siblings, or a fixed size (weight × ~320px) when the parent layout's Scrollable is on",
}
const DATA_BOUND: FieldSchema = { key: 'datastore', label: 'Datastore', type: 'select', dynamicOptions: 'datastores' }
/** datatable/chart/pivot/plotly-chart/html/kpi/parameters only -- layout has its own equivalent, positive-sense `displayTitle`. */
const HIDE_TITLE: FieldSchema = { key: 'hideTitle', label: 'Hide Title', type: 'checkbox' }
/** Shared by layout (row/column of its children) and parameters (row/column of its own field list). */
const DIRECTION: FieldSchema = { key: 'direction', label: 'Direction', type: 'select', options: ['horizontal', 'vertical'] }

const LAYOUT: FieldSchema[] = [
  ...COMMON,
  { key: 'displayTitle', label: 'Display title', type: 'checkbox', defaultChecked: true },
  WEIGHT,
  DIRECTION,
  { key: 'resizable', label: 'Resizable', type: 'checkbox' },
  { key: 'collapsible', label: 'Collapsible', type: 'checkbox', help: 'Adds a collapse toggle to each direct child' },
  {
    key: 'scrollable',
    label: 'Scrollable',
    type: 'checkbox',
    help: 'Children keep a fixed size (their own Weight × ~320px) instead of being fit to the available space, and this layout scrolls (matching Direction) to reach the rest. Overrides Resizable',
  },
]

const TAB: FieldSchema[] = [
  { key: 'title', label: 'Title', type: 'text', help: "Used as this tab's label" },
  { key: 'position', label: 'Position', type: 'select', options: ['top', 'bottom', 'left', 'right'] },
  { key: 'tabStyle', label: 'Style', type: 'select', options: ['basic', 'line'] },
]

const DATATABLE: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  HIDE_TITLE,
  DATA_BOUND,
  { key: 'pagination', label: 'Pagination', type: 'pagination', options: ['10', '50', '100', '200', '1000'] },
  { key: 'filter', label: 'Filter', type: 'checkbox' },
  { key: 'footer', label: 'Footer', type: 'checkbox' },
  { key: 'stickyHeader', label: 'Sticky header', type: 'checkbox' },
  { key: 'hideHeader', label: 'Hide header', type: 'checkbox', help: 'Also hides column filters and the resize/pin/move column menu, since those live in the header' },
  { key: 'resizableColumns', label: 'Resizable columns', type: 'checkbox' },
  { key: 'denseLayout', label: 'Dense layout', type: 'checkbox', defaultChecked: true },
  { key: 'stripedRows', label: 'Striped rows', type: 'checkbox' },
  { key: 'movableColumns', label: 'Movable columns', type: 'checkbox', help: 'Adds Move left/right to each column header\'s menu' },
  { key: 'cellLines', label: 'Cell lines', type: 'checkbox' },
  {
    key: 'signalOnUpdate',
    label: 'Signal on Update',
    type: 'select',
    options: ['neutral', 'green-up-red-down', 'red-up-green-down'],
    noneLabel: 'Off',
    help: "Dataset must include unique 'id' field. Directional modes color a numeric increase/decrease; a non-numeric change always flashes neutral (amber)",
  },
  { key: 'transpose', label: 'Transpose', type: 'checkbox', help: 'Columns become rows and rows become columns. Display is capped to 10 rows. Footer totals, tree rows, grouping, filters and Signal on Update are not supported' },
  { key: 'transposeHeaderField', label: 'Transpose header field', type: 'text', help: 'Transpose only -- datastore field used as each column\'s header; blank shows #1, #2, ...' },
  { key: 'treeRows', label: 'Tree rows', type: 'checkbox' },
  { key: 'treeIdField', label: 'Row id field', type: 'text', help: 'treeRows only -- defaults to "id"' },
  { key: 'treeParentField', label: 'Parent id field', type: 'text', help: 'treeRows only -- defaults to "parentId"' },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const DATATABLE_COLUMN: FieldSchema[] = [
  { key: 'field', label: 'Field', type: 'text' },
  { key: 'fieldDisplay', label: 'Display name', type: 'text' },
  { key: 'hidden', label: 'Hidden', type: 'checkbox', help: 'Excludes this column from the rendered table' },
  { key: 'dataType', label: 'Data type', type: 'select', options: ['str', 'number', 'datetime', 'date', 'badge'] },
  { key: 'dataFormat', label: 'Format', type: 'text', help: '"0,000.00" for numbers; "yyyy-MM-dd" / "yyyyMMdd HH:mm" for dates' },
  { key: 'humanReadable', label: 'Human Readable', type: 'checkbox', help: 'Data type=number only -- abbreviates as k/m/b (1234 -> 1.2k), overriding Format' },
  {
    key: 'colorScale',
    label: 'Color scale',
    type: 'select',
    options: ['sequential', 'diverging'],
    noneLabel: 'None',
    help: 'Data type=number only -- persistently colors each cell by where its value falls in the column\'s range (low/mid/high). Diverging adds a midpoint color, for a column centered on zero/a target',
  },
  { key: 'colorScaleMin', label: 'Color scale min', type: 'number', help: 'Blank -- auto, from the lowest value currently loaded' },
  { key: 'colorScaleMax', label: 'Color scale max', type: 'number', help: 'Blank -- auto, from the highest value currently loaded' },
  { key: 'widthMin', label: 'Min width', type: 'number' },
  { key: 'widthMax', label: 'Max width', type: 'number' },
  { key: 'align', label: 'Align', type: 'select', options: ['left', 'right', 'middle'] },
  { key: 'parameter', label: 'Sets parameter', type: 'text', help: 'Row click sets this panel parameter' },
  { key: 'filterType', label: 'Filter type', type: 'select', options: ['text', 'selector'], noneLabel: 'No filter' },
  { key: 'style', label: 'Style', type: 'text', help: 'CSS declarations, e.g. "color: gray; font-weight: bold" -- applied to every cell in the column' },
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
  HIDE_TITLE,
  DATA_BOUND,
  { key: 'chartType', label: 'Chart type', type: 'select', options: ['line', 'bar', 'pie'] },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const CHART_COLUMN: FieldSchema[] = [
  { key: 'field', label: 'Field', type: 'text' },
  { key: 'fieldDisplay', label: 'Display name', type: 'text' },
  { key: 'dataType', label: 'Data type', type: 'select', options: ['str', 'number', 'date'] },
  { key: 'dataFormat', label: 'Format', type: 'text' },
  { key: 'humanReadable', label: 'Human Readable', type: 'checkbox', help: 'Data type=number only -- abbreviates as k/m/b (1234 -> 1.2k), overriding Format' },
]

const PLOTLY_CHART: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  HIDE_TITLE,
  DATA_BOUND,
  {
    key: 'plotlyConfig',
    label: 'Style config',
    type: 'json',
    help: 'Declarative JSON merged into Plotly layout/traces -- { "layout": {...}, "traces": [{...}] } (no code execution)',
  },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const PLOTLY_TRACE: FieldSchema[] = [
  { key: 'fieldDisplay', label: 'Name', type: 'text', help: 'Legend name; blank falls back to the series/y field' },
  { key: 'seriesField', label: 'Series field', type: 'text', help: "Datastore column holding series values; blank uses 'series'" },
  {
    key: 'series',
    label: 'Series',
    type: 'text',
    help: 'Only rows whose Series field equals this value feed the trace. Blank uses the entire dataset',
  },
  {
    key: 'xColumns',
    label: 'X columns',
    type: 'text',
    help: "Non-heatmap: wide data -- comma-separated columns (or * for all but the Series field) -- column names become x and the matching row's values become y. Overrides X/Y field. Heatmap: see Trace type",
  },
  { key: 'xField', label: 'X field', type: 'text', help: 'Datastore field path for the x axis' },
  { key: 'yField', label: 'Y field', type: 'text', help: 'Datastore field path for the y axis (pie: values, with X as labels). Heatmap: set this to switch to long-format mode -- see Trace type' },
  {
    key: 'traceType',
    label: 'Trace type',
    type: 'select',
    options: ['scatter', 'bar', 'pie', 'heatmap'],
    help:
      'heatmap, Y field blank (wide/pivoted data): X field = row label column, X columns (default *) = value columns shown on y. ' +
      'heatmap, Y field set (long/tidy data, one row per x,y cell): X field/Y field = the x/y columns, X columns names the single z-value column (default: first column that is neither X field, Y field, nor Series field). ' +
      'Either way, colors green (low) to red (high), override via Trace config colorscale',
  },
  { key: 'traceMode', label: 'Mode', type: 'select', options: ['lines', 'markers', 'lines+markers'], help: 'scatter only' },
  { key: 'lineColor', label: 'Line color', type: 'text', help: 'CSS color, e.g. #17becf' },
  { key: 'lineWidth', label: 'Line width', type: 'number' },
  { key: 'colorField', label: 'Marker color field', type: 'text', help: "Datastore field giving each point's marker color" },
  { key: 'sizeField', label: 'Marker size field', type: 'text' },
  { key: 'textField', label: 'Hover text field', type: 'text' },
  { key: 'hidden', label: 'Hidden', type: 'checkbox', help: 'Excludes this trace from the plot' },
  {
    key: 'traceConfig',
    label: 'Trace config',
    type: 'json',
    help: 'Declarative JSON deep-merged into this trace, e.g. { "fill": "tozeroy", "yaxis": "y2" } (no code execution)',
  },
]

const HTML: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  HIDE_TITLE,
  {
    key: 'body',
    label: 'Body',
    type: 'multiline',
    help: 'HTML, sanitized before rendering (script tags/event handlers are stripped). Supports ${param} -- substituted on load and whenever that parameter changes',
  },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const KPI: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  HIDE_TITLE,
  DATA_BOUND,
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const KPI_COLUMN: FieldSchema[] = [
  { key: 'field', label: 'Field', type: 'text', help: 'Datastore column this card is based on -- also the default Body value lookup key' },
  { key: 'fieldDisplay', label: 'Display name', type: 'text' },
  { key: 'dataType', label: 'Data type', type: 'select', options: ['str', 'number', 'datetime', 'date'], help: 'Applied to the Body value' },
  { key: 'dataFormat', label: 'Format', type: 'text', help: '"0,000.00" for numbers; "yyyy-MM-dd" / "yyyyMMdd HH:mm" for dates' },
  { key: 'humanReadable', label: 'Human Readable', type: 'checkbox', help: 'Data type=number only -- abbreviates as k/m/b (1234 -> 1.2k), overriding Format' },
  { key: 'headerValue', label: 'Header value', type: 'text', help: 'An exact datastore field name (looked up in the current row), or literal text with ${param}' },
  { key: 'headerStyle', label: 'Header style', type: 'text', help: 'CSS declarations, e.g. "color: gray; font-size: 12px" -- overrides the default header style. Same field-or-${param} resolution as Header value' },
  { key: 'bodyValue', label: 'Body value', type: 'text', help: 'An exact datastore field name (looked up in the current row), or literal text with ${param}' },
  { key: 'bodyStyle', label: 'Body style', type: 'text', help: 'CSS declarations -- overrides the default body style' },
  { key: 'footerValue', label: 'Footer value', type: 'text', help: 'An exact datastore field name, or literal text with ${param}. Left blank, the footer is omitted entirely' },
  { key: 'footerStyle', label: 'Footer style', type: 'text', help: 'CSS declarations -- overrides the default footer style' },
]

const PARAMETERS: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  HIDE_TITLE,
  { ...DIRECTION, help: 'Arrangement of the parameter fields themselves. Unset behaves as vertical' },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const PIVOT: FieldSchema[] = [
  ...COMMON,
  WEIGHT,
  HIDE_TITLE,
  DATA_BOUND,
  { key: 'rowTotals', label: 'Row grand total', type: 'checkbox', help: 'Adds a Grand Total column per value field, aggregating each row across every column' },
  { key: 'columnTotals', label: 'Column grand total', type: 'checkbox', help: 'Adds a Grand Total row, aggregating each column across every row' },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const PIVOT_COLUMN: FieldSchema[] = [
  { key: 'field', label: 'Field', type: 'text' },
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
  { key: 'humanReadable', label: 'Human Readable', type: 'checkbox', help: 'Data type=number only -- abbreviates as k/m/b (1234 -> 1.2k), overriding Format' },
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
  'plotly-chart': PLOTLY_CHART,
  'plotly-trace': PLOTLY_TRACE,
  html: HTML,
  kpi: KPI,
  'kpi-column': KPI_COLUMN,
  parameters: PARAMETERS,
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
