import type { NodeType, PanelParameter } from '../../api/types'

export type FieldType = 'text' | 'number' | 'select' | 'multiselect' | 'multiline' | 'csv' | 'json' | 'checkbox' | 'pagination'

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  options?: string[]
  /** For type=select with dynamic options (the panel's own datastore names), or type=multiselect (the panel's own drilldowns, links, or parameters, by id/name -- specs/drilldown.md, specs/link.md, specs/parameters2.md). */
  dynamicOptions?: 'datastores' | 'drilldowns' | 'links' | 'parameters'
  /** type=select only: label for the always-present "clear this field" option. Defaults to "None". */
  noneLabel?: string
  /** type=checkbox only: how the box renders when the field is unset on the record -- lets a field default to checked instead of the usual unchecked. */
  defaultChecked?: boolean
  /** type=multiselect only: renders selected options as a reorderable list (up/down + remove) instead of a plain checkbox list, and the array's own order is the value -- see PropertyPanel.tsx's OrderedMultiselectField. */
  orderable?: boolean
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
  { key: 'footer', label: 'Show Totals', type: 'checkbox', help: 'Aggregates each column with a Total set (see that column\'s own Total field). Totals Position below decides where the row renders' },
  {
    key: 'totalsPosition',
    label: 'Totals Position',
    type: 'select',
    options: ['subheader'],
    noneLabel: 'Footer',
    help: 'Show Totals only -- Footer (default) renders the totals row at the bottom; Subheader renders it directly under the column headers instead',
  },
  { key: 'footerStyle', label: 'Footer Style', type: 'text', help: 'Show Totals only -- CSS declarations applied to the totals row\'s cells, wherever Totals Position renders it, e.g. "font-weight: bold; background: #f5f5f5"' },
  { key: 'stickyHeader', label: 'Sticky header', type: 'checkbox' },
  { key: 'hideHeader', label: 'Hide header', type: 'checkbox', help: 'Also hides column filters and the resize/pin/move column menu, since those live in the header' },
  { key: 'headerStyle', label: 'Header Style', type: 'text', help: 'CSS declarations applied to every column header cell, e.g. "background: #f5f5f5; font-weight: bold"' },
  { key: 'showStatusBadge', label: 'Show Status Badge', type: 'checkbox', help: 'Shows the small "On demand" / "Scheduled · <last load>" badge in the corner. Off by default' },
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
  {
    key: 'transposeCellMinWidth',
    label: 'Transposed Cell Min Width',
    type: 'number',
    help: 'Transpose only -- min width (px) of each value cell (r0..rN). A column\'s own field-name/label cell is sized by that column\'s own Transpose Header Min Width instead',
  },
  { key: 'treeRows', label: 'Tree rows', type: 'checkbox' },
  { key: 'treeIdField', label: 'Row id field', type: 'text', help: 'treeRows only -- defaults to "id"' },
  { key: 'treeParentField', label: 'Parent id field', type: 'text', help: 'treeRows only -- defaults to "parentId"' },
  {
    key: 'colorScaleGroup',
    label: 'Color Scale Group',
    type: 'csv',
    help: 'Field names (comma-separated) of this table\'s own columns whose Color scale should combine into one shared min/max range, instead of each column scaling against just its own values. A listed column still needs its own Color scale turned on to render colored',
  },
  {
    key: 'colorScaleScheme',
    label: 'Color Scale Scheme',
    type: 'select',
    options: ['red-green', 'green-red', 'blue-red', 'purple-orange', 'grayscale'],
    noneLabel: 'Red / Amber / Green (default)',
    help: 'The low/mid/high palette every Color scale column in this table uses. green-red is red-green inverted, for a column where the high end is the bad one',
  },
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
    help: 'Persistently colors each cell by where its value falls in the column\'s range (low/mid/high), as long as its values parse as numbers -- not limited to Data type=number. Diverging adds a midpoint color, for a column centered on zero/a target. See the datatable\'s own Color Scale Group to combine several columns onto one shared range',
  },
  { key: 'colorScaleMin', label: 'Color scale min', type: 'number', help: 'Blank -- auto, from the lowest value currently loaded' },
  { key: 'colorScaleMax', label: 'Color scale max', type: 'number', help: 'Blank -- auto, from the highest value currently loaded' },
  { key: 'widthMin', label: 'Min width', type: 'number' },
  { key: 'widthMax', label: 'Max width', type: 'number' },
  { key: 'align', label: 'Align', type: 'select', options: ['left', 'right', 'middle'] },
  { key: 'parameter', label: 'Sets parameter', type: 'text', help: 'Row click sets this panel parameter' },
  { key: 'filterType', label: 'Filter type', type: 'select', options: ['text', 'selector'], noneLabel: 'No filter' },
  { key: 'style', label: 'Style', type: 'text', help: 'CSS declarations, e.g. "color: gray; font-weight: bold" -- applied to every cell in the column' },
  {
    key: 'transposeHeaderStyle',
    label: 'Transpose Header Style',
    type: 'text',
    help: 'Datatable\'s own Transpose only -- CSS declarations applied to this column\'s own field-name/label cell when transposed (layered on top of Style above)',
  },
  {
    key: 'transposeHeaderMinWidth',
    label: 'Transpose Header Min Width',
    type: 'number',
    help: 'Datatable\'s own Transpose only -- min width (px) of this column\'s own label cell when transposed. Its text always wraps rather than clipping',
  },
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
    help:
      'Declarative JSON merged into Plotly layout/traces -- { "layout": {...}, "traces": [{...}] } (no code execution). ' +
      'layout may reference ${param} (e.g. a dynamic title); unknown ${name} is left as-is',
  },
  { key: 'drilldownIds', label: 'Drilldowns', type: 'multiselect', dynamicOptions: 'drilldowns', help: 'Adds each to this control\'s right-click menu' },
  { key: 'linkIds', label: 'Links', type: 'multiselect', dynamicOptions: 'links', help: 'Adds each to this control\'s right-click menu' },
]

const PLOTLY_TRACE: FieldSchema[] = [
  { key: 'fieldDisplay', label: 'Name', type: 'text', help: "Legend name; blank falls back to Trace config's own \"name\", if any" },
  { key: 'hidden', label: 'Hidden', type: 'checkbox', help: 'Excludes this trace from the plot' },
  {
    key: 'seriesField',
    label: 'Series Column',
    type: 'text',
    help: "Datastore column holding each row's series identifier, for multiple traces off one dataset. Blank uses 'series'. Overridden by Trace config's own \"seriesField\" if it sets one",
  },
  {
    key: 'series',
    label: 'Series Value',
    type: 'text',
    help: 'Only rows whose Series Column equals this feed this trace -- filters one dataset down per trace. Blank = every row. May reference ${param}. Overridden by Trace config\'s own "series" if it sets one',
  },
  {
    key: 'traceConfig',
    label: 'Trace config',
    type: 'json',
    help:
      'This trace\'s Plotly object, authored as JSON (no code execution) -- any property, for any of: bar, box, candlestick, heatmap, histogram, pie, scatter, surface (anything else falls back to scatter). ' +
      'A value that\'s only "#columnName#" becomes an array of that datastore column\'s value, one per row (x, y, z, open/high/low/close, labels, values, marker.size, marker.color, ...). ' +
      'A value mixing "#columnName#" with other text becomes one formatted string per row (for text/hovertext). Any other string may reference ${param}. ' +
      'Two reserved keys select which rows feed this trace rather than being passed to Plotly -- same as the Series Column/Series Value fields above, just here instead if you\'d rather keep it all in JSON: "series" (only rows whose "seriesField" column -- default \'series\' -- equals it; blank/absent = every row) and "seriesField". ' +
      'Examples -- line: {"type":"scatter","mode":"lines","x":"#date#","y":"#price#"}. bar: {"type":"bar","x":"#category#","y":"#value#"}. ' +
      'bubble: {"type":"scatter","mode":"markers","x":"#x#","y":"#y#","marker":{"size":"#size#"}}. pie: {"type":"pie","labels":"#category#","values":"#amount#"}. ' +
      'box: {"type":"box","y":"#value#","x":"#group#"}. histogram: {"type":"histogram","x":"#value#"}. ' +
      'candlestick: {"type":"candlestick","x":"#date#","open":"#open#","high":"#high#","low":"#low#","close":"#close#"}. ' +
      'timeseries: same as line -- Plotly auto-detects a date x-axis (or set plotlyConfig.layout.xaxis.type explicitly). ' +
      'heatmap/surface (long/tidy data, one row per x,y cell): {"type":"heatmap","x":"#xcol#","y":"#ycol#","z":"#zcol#"} -- x/y/z are auto-reshaped into the 2D grid these two need ' +
      '(distinct x/y values become the grid\'s columns/rows, first-seen order); heatmap colors green-to-red by default, override with colorscale',
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
  {
    key: 'parameterNames',
    label: 'Parameters',
    type: 'multiselect',
    orderable: true,
    dynamicOptions: 'parameters',
    help: 'Which panel parameters this control shows, and in what order -- independent of the panel-wide Parameters list order. Blank -- every non-hidden panel parameter, in the panel\'s own order',
  },
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

/** Field schema for a panel-level Parameter (specs/control_attributes.md's `parameter:`). Per-Parameter-type settings live in PARAMETER_TYPE_CONFIG_SCHEMAS instead, behind the editor's "Configure" button (specs/parameters3.md) -- not here. */
export const PARAMETER_SCHEMA: FieldSchema[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'defaultValue', label: 'Default value', type: 'text' },
  { key: 'hidden', label: 'Hidden', type: 'checkbox', help: 'Still usable, but not shown in the Parameters dialog' },
  {
    key: 'inputType',
    label: 'Parameter type',
    type: 'select',
    options: ['calendar', 'range', 'selector-single', 'selector-multi', 'toggle'],
    noneLabel: 'Input box',
    help: 'Picking a type unlocks its own "Configure" button below, for settings specific to that type (options datastore, range bounds, date format, ...)',
  },
  {
    key: 'addToHeader',
    label: 'Add to header',
    type: 'checkbox',
    help: "Also shows this parameter's own input directly in the dashboard viewer's header, in addition to the Parameters dialog",
  },
]

/** specs/parameters3.md: one FieldSchema[] per PanelParameter.inputType, rendered by ParameterTypeConfigDialog.tsx's "Configure" button -- only the settings relevant to that one type, instead of every type's fields always sitting in PARAMETER_SCHEMA above. */
const SELECTOR_DATASTORE_FIELDS: FieldSchema[] = [
  {
    key: 'datastore',
    label: 'Options datastore',
    type: 'select',
    dynamicOptions: 'datastores',
    help: "Populates this parameter's picker from the datastore's rows",
  },
  {
    key: 'selectorColumn',
    label: 'Selector column',
    type: 'text',
    help: 'Which column supplies the actual value. Blank uses the first column',
  },
  {
    key: 'displayColumn',
    label: 'Display column',
    type: 'text',
    help: "Which column is shown to the user instead of Selector column's own value (e.g. selector column \"id\", display column \"value\" shows each row's value while still storing its id). Blank -- shows Selector column's value",
  },
]
export const PARAMETER_TYPE_CONFIG_SCHEMAS: Partial<Record<NonNullable<PanelParameter['inputType']>, FieldSchema[]>> = {
  range: [
    { key: 'rangeMin', label: 'Range min', type: 'number', help: 'Slider lower bound. Blank -- 0' },
    { key: 'rangeMax', label: 'Range max', type: 'number', help: 'Slider upper bound. Blank -- 100' },
    { key: 'rangeStep', label: 'Range step', type: 'number', help: 'Slider increment. Blank -- 1' },
    { key: 'displayTicks', label: 'Display Ticks', type: 'checkbox', help: 'Shows a tick mark at each step along the slider (skipped above 50 ticks)' },
  ],
  toggle: [
    {
      key: 'toggleValues',
      label: 'Toggle values',
      type: 'text',
      help: '"<on>|<off>", e.g. "yes|no" -- the two values actually stored/substituted. Blank -- "true|false"',
    },
  ],
  'selector-single': SELECTOR_DATASTORE_FIELDS,
  'selector-multi': [
    ...SELECTOR_DATASTORE_FIELDS,
    { key: 'selectorDelimiter', label: 'Delimiter', type: 'text', help: 'Joins/splits the selected values. Blank -- ","' },
    {
      key: 'selectorEnclosure',
      label: 'Text enclosure',
      type: 'text',
      help: 'Wraps each selected value, e.g. \'AAPL\',\'MSFT\' -- so a value containing the delimiter still round-trips. Blank -- "\'". Deliberately clear for no enclosure at all',
    },
  ],
  calendar: [
    { key: 'calendarFormat', label: 'Date format', type: 'text', help: 'A date-fns format pattern. Blank -- "yyyy-MM-dd"' },
    {
      key: 'calendarDefaultExpr',
      label: 'Default date expression',
      type: 'text',
      help: '"today", "today+5 day", "today-2 business day" -- resolved fresh each time the dashboard loads. Overrides Default value above when set; blank -- Default value is used as-is',
    },
  ],
}

/** Field schema for a panel-level Link (specs/link.md). */
export const LINK_SCHEMA: FieldSchema[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'url', label: 'URL', type: 'text', help: 'May reference ${param}, e.g. http://url.com/${parameter1}/${parameter2}' },
  { key: 'target', label: 'Opens in', type: 'select', options: ['tab', 'window'] },
]
