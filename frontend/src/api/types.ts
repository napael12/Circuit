// Mirrors backend DRF serializers (connections/catalog/panels/datastore/portal).

/** Response shape of DataConnectionViewSet's test/test-config actions. */
export interface ConnectionTestResult {
  ok: boolean
  message: string
}

/** Response shape of DatastoreViewSet's preview/preview-config actions. */
export interface DatastorePreviewResult {
  ok: boolean
  data?: unknown
  message?: string
}

export interface DataConnection {
  id: string
  description: string
  /**
   * 'http' (specs/http-connection.md): authorization for arbitrary HTTP
   * endpoints, used by source_type='serialized' datastores.
   */
  type: 'sql' | 's3' | 'http'
  dialect: string
  host: string
  port: number | null
  database: string
  options: Record<string, unknown>
  /** type=http: optional "Authorization URL" -- required for auth_type=digest, otherwise only used by Test. */
  url: string
  /** type=http: Basic/Digest auth username. */
  username: string
  /**
   * Per-type settings that don't fit the shared columns above -- see
   * backend/connections/models.py's DataConnection.config docstring for the
   * shape per type. Secret-shaped keys (secret_key, token, api_key_value)
   * come back blanked from the API; leave them blank on save to keep the
   * stored value.
   *
   * type=http: {auth_type: 'none'|'basic'|'api_key'|'bearer'|'digest',
   *   api_key_name?, api_key_value?, api_key_location?: 'header'|'query',
   *   token?, digest_algorithm?, headers?: Record<string, string>}.
   */
  config: Record<string, unknown>
  max_rows: number | null
  timeout_seconds: number
  created_at: string
  updated_at: string
  /** specs/permissions.md: Role ids allowed to view/use this connection. Empty = everyone. */
  allowed_roles: number[]
}

/** Response shape of DataConnectionViewSet's import/ action. */
export interface ConnectionImportResult {
  created: string[]
  updated: string[]
  errors: unknown[]
}

export interface SqlDef {
  id: string
  description: string
  content: string
  updated_at: string
  updated_by: number | null
}

export type RendererType = 'none' | 'json' | 'xml' | 'delimited' | 'fixed_width'

/** A column extracted via JsonPath/XPath -- renderer_config.columns for renderer_type=json/xml. */
export interface RendererColumn {
  name: string
  path: string
}

/** A field slice -- renderer_config.fields for renderer_type=fixed_width. */
export interface RendererField {
  name: string
  width: number
}

export interface Datastore {
  /** Both the primary key and the display name -- no separate "name" field, same convention as DataConnection. */
  id: string
  /**
   * 'serialized' (specs/serialized-datastore.md) supersedes the former
   * 'action'/'s3'/'json' types (each removed): it fetches raw content via
   * HTTP/S3/File (see access_type) and parses it with the shared
   * renderer_type/renderer_config interface.
   */
  source_type: 'query' | 'serialized'
  /** source_type=serialized only: where its raw content is fetched from. */
  access_type: 'http' | 's3' | 'file' | ''
  /**
   * source_type=query: a type=sql connection. source_type=serialized: a
   * type=http connection (access_type=http, optional) or a type=s3
   * connection (access_type=s3, required); unused for access_type=file.
   */
  connection: string | null
  sql_def: string | null
  /** source_type=query only. Supports ${param} the same way the serialized fields above do (Settings fallback, dotted keys included). */
  inline_sql: string
  row_limit: number | null
  /** Result cache term in seconds, keyed by datastore + all input parameters; null/0 = no caching. Cleared via POST /datastores/{id}/clear-cache/. */
  cache_seconds: number | null
  /**
   * source_type=serialized + access_type=s3: object key/path within the
   * connection's bucket, used when object_url is blank. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included).
   */
  object_key: string
  /** source_type=serialized + access_type=s3 only: a full object URL, tried instead of connection+object_key when set. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included). */
  object_url: string
  /**
   * source_type=serialized: the collapsible "Body" override used for test/
   * troubleshooting -- when non-blank, parsed directly instead of actually
   * fetching from access_type's configured source. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included).
   */
  body: string
  /** source_type=serialized + access_type=http: the request URL, used as-is. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included). */
  data_url: string
  /** source_type=serialized + access_type=http only. */
  request_method: 'GET' | 'POST'
  /** source_type=serialized + access_type=http only: key -> value query/form params. Each value supports ${param}. */
  request_params: Record<string, string>
  /** source_type=serialized + access_type=http only: raw request body (JSON/text/XML) for POST. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included). */
  request_body: string
  /** source_type=serialized + access_type=file only: a directory on the server's own filesystem. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included). */
  file_path: string
  /** source_type=serialized + access_type=file only: filename and/or regex selecting one file within file_path. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included). */
  file_expression: string
  /** How raw content is turned into rows/columns -- see datastore/renderers.py. source_type=serialized only offers json/xml/delimited. */
  renderer_type: RendererType
  /**
   * renderer_type=json/xml: {root_path?, columns: RendererColumn[]}; json also takes orient? ('records' default | 'index' | 'columns' | 'split' | 'values', as pandas to_json) and index_name? (default 'index').
   * renderer_type=delimited: {delimiter, has_header, quote_char?, columns?: string[]}.
   * renderer_type=fixed_width: {fields: RendererField[]}.
   */
  renderer_config: Record<string, unknown>
  default_params: Record<string, unknown>
  /** specs/api_datastore.md: public API access via the pull/push endpoints. 'push' is only valid for source_type='serialized' using the JSON renderer. */
  api_mode: 'none' | 'pull' | 'push'
  refresh_mode: 'on_demand' | 'scheduled'
  cron_schedule: string
  /** refresh_mode=scheduled only: stop refreshing after this many seconds with no dashboard/control watching (null/0 = never stop). See datastore.activity. */
  idle_timeout_seconds: number | null
  /** refresh_mode=scheduled only (null for on_demand): computed fresh per read from datastore.activity -- true while a dashboard/control has this open (or idle_timeout_seconds is 0). */
  is_active: boolean | null
  last_run_at: string | null
  last_error: string
  created_at: string
  updated_at: string
  /**
   * specs/permissions.md: Role ids allowed to view/use this datastore. Empty
   * = everyone. Automatically forced to match the effective connection's own
   * allowed_roles whenever that connection is restricted -- see
   * backend/datastore/roles.py.
   */
  allowed_roles: number[]
}

/** Response shape of DatastoreViewSet's import/ action. */
export interface DatastoreImportResult {
  created: string[]
  updated: string[]
  errors: unknown[]
}

export interface Panel {
  id: string
  name: string
  /** Optional user-set alias -- /panel/${slug} resolves the same as /panel/${id} (specs/slug.md). */
  slug?: string | null
  /** Free-form grouping/labeling, shown in the editor's collapsible section below Name/Slug -- not referenced by rendering/access logic. */
  category: string
  subcategory: string
  description: string
  content: PanelContent
  created_at: string
  created_by: number | null
  created_by_username: string | null
  updated_at: string
  updated_by: number | null
  updated_by_username: string | null
  /** Annotated by PanelViewSet from the most recent PanelUsage row -- not a real model field. */
  last_accessed_at: string | null
  last_accessed_by_username: string | null
  /** specs/permissions.md: Role ids allowed to view this dashboard. Empty = everyone. */
  allowed_roles: number[]
}

/** specs/panel_tracking.md: one row of PanelViewSet's usage-summary action's "top 5 users" table. */
export interface PanelUsageTopUser {
  user_id: number | null
  name: string
  visits: number
  last_visit: string
}

/** Response shape of PanelViewSet's usage-summary/ action -- the tracking dialog's "Key Indicators" tab. */
export interface PanelUsageSummary {
  total_visits: number
  total_unique_users: number
  first_visit: string | null
  last_visit: string | null
  top_users: PanelUsageTopUser[]
}

/** One row of PanelViewSet's usage/ action -- the tracking dialog's "Visits" tab. */
export interface PanelUsageRow {
  id: number
  accessed_at: string
  user_id: number | null
  user_name: string
  ip_address: string | null
}

/** One row of PanelViewSet's updates/ action -- the tracking dialog's "Updates" tab. */
export interface PanelUpdateRow {
  id: number
  updated_at: string
  user_name: string
}

export interface NavNode {
  id: string
  text: string
  link?: string
  item?: NavNode[]
}

export interface Setting {
  id: number
  profile: string
  key: string
  value: string
}

/** specs/circuit.md: white-label branding -- GET /api/branding/, readable pre-login. */
export interface BrandingInfo {
  name: string
  icon: string
  favicon: string
  version: string
}

export interface SessionInfo {
  authenticated: boolean
  username?: string
  /** specs/permissions.md: holds the ADMIN role, == is_superuser (accounts.signals). Full Manager access. */
  is_admin?: boolean
  roles?: string[]
}

/** An internal role (accounts.models.Role) -- replaces Django's built-in Group. */
export interface Role {
  id: number
  name: string
  description: string
  /** The one built-in ADMIN role (specs/permissions.md) -- read-only, seeded by a migration. */
  is_admin: boolean
}

/** An internal user account (accounts.models.User) -- replaces Django's built-in auth.User. */
export interface AppUser {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  is_active: boolean
  /** Read-only -- derived from ADMIN role membership (accounts.signals), not directly settable. */
  is_superuser: boolean
  roles: number[]
  last_login: string | null
  date_joined: string
}

/** specs/api_datastore.md: a key external clients present (X-API-Key header) to pull/push Datastore data on behalf of `user`. */
export interface ApiKey {
  id: string
  name: string
  /** First 11 chars of the plaintext key (never the full secret) -- shown in listings so a row is recognizable. */
  key_prefix: string
  user: number
  user_username: string | null
  is_active: boolean
  created_at: string
  created_by: number | null
  created_by_username: string | null
  last_used_at: string | null
}

/** ApiKeyViewSet's create/ response shape -- `key` is the plaintext secret, present only this once. */
export type ApiKeyCreateResult = ApiKey & { key: string }

/** Response shape of ApiKeyViewSet's usage-summary/ action. */
export interface ApiKeyUsageSummary {
  total_calls: number
  pull_calls: number
  push_calls: number
  first_call: string | null
  last_call: string | null
}

/** One row of ApiKeyViewSet's usage/ action. */
export interface ApiKeyUsageRow {
  id: number
  accessed_at: string
  mode: 'pull' | 'push'
  datastore_id: string
  ip_address: string | null
  ok: boolean
  detail: string
}

// --- Panel JSON document shape (see specs/panel_rendering.md,
// specs/panel_design.md, specs/control_attributes.md, and the worked
// example specs/panel_mockup1.json) --------------------------------------

export interface PanelParameter {
  name: string
  label: string
  defaultValue?: string
  /** Runtime value -- not persisted, present only on values returned to a running preview/session. */
  value?: string
  dataType: 'str' | 'number' | 'date'
  /** Participates in substitution/datastore params but is hidden from the Parameters dialog and status bar. */
  hidden?: boolean
  /** Datastore name (see PanelContent.datastores) that supplies this parameter's select options, if any. */
  datastore?: string
  /**
   * datastore only -- which of the datastore's columns supplies the actual
   * option value. Unset falls back to the first column (the pre-existing
   * behavior). When the datastore's rows have more than one column, the
   * picker renders as a lookup table (every column shown, for context)
   * instead of a plain dropdown -- selectorColumn is still what a row click
   * actually sets the parameter to.
   */
  selectorColumn?: string
}

/**
 * A datastore this panel uses, per control_attributes.md's `datastores[]`.
 * scope='global' entries just reference a shared datastore.models.Datastore
 * row by id (in `name`); scope='local' entries carry that row's full field
 * set inline instead -- a one-off query/serialized binding that only this
 * panel needs, still pointing at a global Connection so credentials stay
 * centrally managed. Local datastores are always on-demand -- no cron
 * scheduling.
 */
export interface PanelDatastoreRef {
  id: string
  /** The reference name content nodes use in their own `datastore` field -- for scope=global, this *is* the global Datastore's id. */
  name: string
  scope: 'global' | 'local'
  // --- scope=local only, same shape as datastore.models.Datastore ---
  source_type?: 'query' | 'serialized'
  access_type?: 'http' | 's3' | 'file' | ''
  connection?: string
  inline_sql?: string
  row_limit?: number
  object_key?: string
  object_url?: string
  body?: string
  data_url?: string
  request_method?: 'GET' | 'POST'
  request_params?: Record<string, string>
  request_body?: string
  file_path?: string
  file_expression?: string
  renderer_type?: RendererType
  renderer_config?: Record<string, unknown>
  default_params?: Record<string, string>
}

export type NodeType =
  | 'layout'
  | 'tab'
  | 'datatable'
  | 'chart'
  | 'datatable-column'
  | 'chart-column'
  | 'pivot'
  | 'pivot-column'
  | 'plotly-chart'
  | 'plotly-trace'
  | 'html'
  | 'kpi'
  | 'kpi-column'
  | 'parameters'

export interface PanelNode {
  id: string
  type: NodeType
  title?: string // may contain ${param} -- see utils/panelTemplating.ts
  /**
   * datatable / chart / pivot / plotly-chart / html / kpi only -- hides the
   * leaf control's own card-header title (LeafNode in PanelLayout.tsx).
   * Unset/false shows it. Negative-sense (unlike layout's `displayTitle`)
   * to match how it reads in the property panel. `title` itself is left
   * alone -- still used for CSV export filenames, and plotly-chart's own
   * in-canvas Plotly title also honors this flag so the two don't show the
   * same text redundantly.
   */
  hideTitle?: boolean
  // --- layout ---
  weight?: number // flex weight among siblings; a fixed-size multiplier instead when `scrollable` is on -- see below
  /** layout: row vs column for its children. parameters: same idea, for its own field list -- see ParametersControl.tsx. Undefined/unset behaves as 'horizontal' for layout, 'vertical' for parameters (each control's own natural default). */
  direction?: 'horizontal' | 'vertical'
  resizable?: boolean
  /** Each direct child gets a collapse/expand toggle, shrinking it to a thin strip when collapsed. */
  collapsible?: boolean
  /**
   * Children keep a fixed size (their own `weight` × a constant, instead of
   * being flex-grown to fill the available space) and the container scrolls
   * (along `direction`) to reach the ones that don't fit -- see
   * PanelLayout.tsx's LayoutNode. Forces `resizable` off.
   */
  scrollable?: boolean
  /** layout only -- whether `title` renders. Undefined/unset behaves as checked (shown). */
  displayTitle?: boolean
  // --- tab ---
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** tab only -- 'basic' (a muted pill around the active tab) or 'line' (a thin underline). Undefined/unset behaves as 'basic'. */
  tabStyle?: 'basic' | 'line'
  // --- container children: layout -> layout/tab/datatable/chart/pivot/plotly-chart/html/kpi; tab -> layout/datatable/chart/pivot/plotly-chart/html/kpi ---
  components?: PanelNode[]
  // --- datatable / chart / plotly-chart / kpi ---
  /** PanelDatastoreRef.name this control is fed by. */
  datastore?: string
  /** Rows per page; undefined/0 means no pagination (renders the whole result, capped for safety -- see DatatableControl). */
  pagination?: number
  filter?: boolean
  footer?: boolean
  stickyHeader?: boolean
  /** datatable only -- omits the column header row (and its filter/resize/pin/move affordances) from the rendered table entirely. */
  hideHeader?: boolean
  /** datatable only -- lets a column's header be dragged to resize it. Undefined/unset behaves as unchecked (not resizable). */
  resizableColumns?: boolean
  /** datatable only -- tighter row/cell padding. Undefined/unset behaves as checked (dense), matching this control's pre-existing always-on behavior. */
  denseLayout?: boolean
  /** datatable only -- alternating row background. */
  stripedRows?: boolean
  /** datatable only -- adds Move left/right controls to each column header's menu. */
  movableColumns?: boolean
  cellLines?: boolean
  /**
   * datatable only -- briefly flashes a cell's background when its value
   * changes between data updates. Requires each row's dataset to include a
   * unique 'id' field -- rows are diffed by that field, so rows without one
   * (or with a non-unique/positional fallback id) can misfire on
   * reorder/refetch. 'neutral' flashes amber regardless of direction;
   * 'green-up-red-down'/'red-up-green-down' color a numeric increase/
   * decrease accordingly and fall back to the neutral amber for a changed
   * value that isn't numeric (e.g. a string/date/badge column). `true` is
   * legacy shorthand for 'neutral' -- a dashboard saved before these modes
   * existed.
   */
  signalOnUpdate?: boolean | 'neutral' | 'green-up-red-down' | 'red-up-green-down'
  /** datatable only -- display-only transpose: each column becomes a row and each (first 10) source row a column. Footer totals, tree rows, grouping, filters and Signal on Update are ignored while on. */
  transpose?: boolean
  /** datatable transpose only -- datastore field whose value heads each transposed column. Blank -> "#1", "#2", ... */
  transposeHeaderField?: string
  treeRows?: boolean
  treeIdField?: string
  treeParentField?: string
  chartType?: 'line' | 'bar' | 'pie'
  // --- pivot ---
  /** Extra "Grand Total" column per value pivot-column: each row's aggregate across every column-group. */
  rowTotals?: boolean
  /** Extra "Grand Total" row: each column's aggregate across every row. */
  columnTotals?: boolean
  /** datatable-column / chart-column / pivot-column / kpi-column / plotly-trace children. */
  columns?: PanelNode[]
  // --- datatable-column / chart-column / pivot-column / kpi-column ---
  /** kpi-column: the datastore field this card was generated from -- also the default `bodyValue` lookup key (optional; a card can be built from scratch with no underlying field). */
  field?: string
  fieldDisplay?: string
  dataType?: 'str' | 'number' | 'datetime' | 'date' | 'badge'
  /** e.g. "0,000.00" for numbers; "yyyy-MM-dd" / "yyyyMMdd HH:mm" for date/datetime. Ignored for dataType=number when humanReadable is checked. */
  dataFormat?: string
  /** dataType=number only -- abbreviates per thousand/million/billion (1234 -> "1.2k", 2500000000 -> "2.5b"), overriding dataFormat's pattern. */
  humanReadable?: boolean
  /**
   * datatable-column, dataType=number only -- persistently colors each
   * cell's background by where its value falls in the column's range
   * (Excel-style conditional formatting; distinct from signalOnUpdate's
   * transient flash on a value *changing*). 'sequential' interpolates a
   * fixed low->high color pair; 'diverging' adds a midpoint color, useful
   * for a column centered on zero/a target. Unset/'none' -- no coloring.
   */
  colorScale?: 'none' | 'sequential' | 'diverging'
  /** colorScale only -- fixes the low/high end of the range instead of auto-computing it from the currently loaded rows. Either may be left unset to auto-compute just that end. */
  colorScaleMin?: number
  colorScaleMax?: number
  widthMin?: number
  widthMax?: number
  align?: 'left' | 'right' | 'middle'
  /** datatable-column only -- clicking a cell in this column sets this panel parameter. */
  parameter?: string
  /** 'text' -- free-text substring match. 'selector' -- checkbox list of the column's distinct values, OR'd together. */
  filterType?: 'text' | 'selector'
  /** datatable-column only -- CSS declarations ("color: gray; font-weight: bold") applied to every cell in the column, same free-form convention as kpi-column's headerStyle/bodyStyle/footerStyle (see utils/panelFormat.ts's parseCssText). */
  style?: string
  totalExpession?: 'sum' | 'avg' | 'min' | 'max'
  pinnable?: boolean
  /** datatable-column only -- excludes this column from the rendered table (header/cells/footer) when checked. */
  hidden?: boolean
  /**
   * datatable-column only -- turns on grouping for the whole datatable.
   * 'value' marks the single column rows are grouped by (its distinct
   * values collapse the table to one row per group -- at most one column
   * should be 'value'; if more than one is, the first found wins). Every
   * other column with a groupFunction aggregates across each group; a
   * column left unset just shows its first row's value per group.
   */
  groupFunction?: 'value' | 'sum' | 'min' | 'max' | 'avg' | 'count'
  // --- pivot-column ---
  /** Which pivot axis this field feeds. Order among same-role siblings sets nesting order (outermost first). */
  role?: 'index' | 'column' | 'value'
  /** role=value only: how cells for this field are aggregated across the source rows they group. */
  aggrFunction?: 'sum' | 'avg' | 'min' | 'max' | 'count'
  /** role=index/column only: ordering of this field's distinct group values. */
  sort?: 'none' | 'asc' | 'desc'
  /**
   * role=index/column only -- adds a "{value} Total" subtotal row (index) or
   * column (column) after each of this field's groups, aggregating every
   * role=value pivot-column across just that group using its own
   * aggrFunction. Distinct from the pivot-level rowTotals/columnTotals
   * (the grand total across the *entire* pivot) -- this aggregates at this
   * field's own group level, e.g. one subtotal per distinct index value.
   */
  subtotal?: boolean
  /**
   * datatable / chart / pivot / plotly-chart / html / kpi only -- ids of
   * PanelContent.drilldowns this control's right-click menu can open
   * (specs/drilldown.md). A control with none configured shows no drilldown
   * items on its context menu.
   */
  drilldownIds?: string[]
  /**
   * datatable / chart / pivot / plotly-chart / html / kpi only -- ids of PanelContent.links
   * this control's right-click menu can open (specs/link.md). A control with
   * none configured shows no link items on its context menu.
   */
  linkIds?: string[]
  // --- plotly-chart ---
  /**
   * JSON merged into Plotly's layout object and, via `traces[i]`, into each
   * built trace object above -- lets an author customize titles, colors,
   * axis formatting, legend position, etc. Declarative only -- JSON.parse
   * output (plain objects/arrays/primitives), never executed as code.
   */
  plotlyConfig?: unknown
  // --- plotly-trace (child of plotly-chart; its display name is `fieldDisplay`, `hidden` omits it from the plot) ---
  /** plotly-trace: value matched against the datastore's `series` column -- only rows whose seriesField value equals it feed this trace. Blank uses the entire dataset. */
  series?: string
  /** plotly-trace: datastore column `series` is matched against. Blank -> 'series'. */
  seriesField?: string
  /**
   * plotly-trace, non-heatmap types: wide-data mode -- comma-separated datastore columns (or '*'
   * for every column except seriesField) plotted with the column names as x and the first
   * matching row's values as y. Overrides xField/yField.
   *
   * plotly-trace, traceType=heatmap: yField unset -> wide/pivoted format, same column list/'*' as
   * above, but the column names become the y-axis categories and each row's values become z.
   * yField set -> long/tidy format (one row per (x, y) cell already) -- xColumns instead names the
   * single z-value column; blank/'*' defaults to the first column that's neither xField, yField,
   * nor seriesField.
   */
  xColumns?: string
  /** plotly-trace: datastore field paths for the x / y axes. */
  xField?: string
  yField?: string
  /** plotly-trace: 'scatter' (default) | 'bar' | 'pie' | 'heatmap'. */
  traceType?: string
  /** plotly-trace: 'lines' | 'markers' | 'lines+markers' (scatter only). */
  traceMode?: string
  /** plotly-trace: datastore fields supplying per-point marker color / size / hover text. */
  colorField?: string
  sizeField?: string
  textField?: string
  /** plotly-trace: literal CSS color / pixel width of the trace's line. */
  lineColor?: string
  lineWidth?: number
  /** plotly-trace: declarative JSON deep-merged into this trace's Plotly object (JSON.parse output, never executed). */
  traceConfig?: unknown
  // --- html ---
  /** html only -- HTML, sanitized (DOMPurify -- strips <script> and on* handlers) after ${param} substitution, then rendered. Admin-authored (IsAdminOrReadOnly gates editing), same trust boundary as editing any other control. May contain ${param}, substituted on load and whenever that parameter's value changes. */
  body?: string
  // --- kpi-column ("Card") ---
  /** kpi-column: text shown in the card header (specs/kpi.md's smaller-font slot). Either an exact key of the kpi's current row (looked up and rendered as that value) or literal text with ${param} -- see resolveExpression in KpiControl.tsx. Defaults to the source field's display name when a card is generated from a sample. */
  headerValue?: string
  /** kpi-column: CSS declarations ("color: gray; font-size: 12px") applied to the header, overriding its default style. Same field-or-${param} resolution as headerValue. */
  headerStyle?: string
  /** kpi-column: text shown in the card body (specs/kpi.md's bold/larger-font slot). Same field-or-${param} resolution as headerValue. Defaults to the source field's own name (i.e. looked up in the row) when a card is generated from a sample. */
  bodyValue?: string
  /** kpi-column: CSS declarations applied to the body, overriding its default style. */
  bodyStyle?: string
  /** kpi-column: text shown in the card footer (specs/kpi.md's smaller-font slot) -- blank (the default) omits the footer entirely rather than rendering an empty one. */
  footerValue?: string
  /** kpi-column: CSS declarations applied to the footer, overriding its default style. */
  footerStyle?: string
}

/**
 * specs/drilldown.md: a separate, named tree of controls -- same node types
 * and rules as PanelContent.content's own root (`root` is itself a 'layout'
 * node) -- that only ever renders inside a popup dialog, explicitly opened
 * from a content control's right-click menu (see PanelNode.drilldownIds).
 * Shares the panel's own `parameters` and `datastores` rather than carrying
 * its own -- same functionality to load data and process parameters as
 * content, just a different on-screen arrangement shown on demand.
 */
export interface PanelDrilldown {
  id: string
  name: string
  root: PanelNode
}

/**
 * specs/link.md: a named external URL a control can open on demand, rather
 * than rendering anything inline (unlike PanelDrilldown, which pops its own
 * PanelLayout). `url` may reference ${param} tokens (same substitution as
 * title/datastore text, see utils/panelTemplating.ts), resolved against the
 * panel's current parameter values when the link is triggered.
 */
export interface PanelLink {
  id: string
  name: string
  url: string
  /** 'tab' opens via plain window.open (a new tab in most browsers); 'window' adds window-feature hints that push browsers to open a separate window instead. */
  target: 'tab' | 'window'
}

export interface PanelContent {
  parameters: PanelParameter[]
  datastores: PanelDatastoreRef[]
  /** Exactly one 'layout' root -- content[0] -- per specs/panel_design.md. */
  content: PanelNode[]
  /** specs/drilldown.md -- same level as `content`. Absent/empty means this panel defines no drilldowns. */
  drilldowns?: PanelDrilldown[]
  /** specs/link.md -- same level as `content`. Absent/empty means this panel defines no links. */
  links?: PanelLink[]
}
