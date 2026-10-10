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
   * 'snowflake': a Snowflake account, queried the same way as 'sql'
   * (source_type='query' datastores can pick either) but configured
   * entirely through `config` instead of dialect/host/port/database/
   * username/password -- see that field's own doc comment below.
   * 'http' (specs/http-connection.md): authorization for arbitrary HTTP
   * endpoints, used by source_type='serialized' datastores.
   */
  type: 'sql' | 'snowflake' | 's3' | 'http'
  dialect: string
  host: string
  port: number | null
  database: string
  options: Record<string, unknown>
  /** type=http: optional "Authorization URL" -- required for auth_type=digest, auth_type=oauth's Token URL, otherwise only used by Test. */
  url: string
  /** type=http: Basic/Digest auth username. */
  username: string
  /**
   * type=sql/http: db/Basic/Digest auth password -- write-only on the API
   * (never comes back from a GET) *except* when the saved value is a
   * ${...} reference (a Setting or ${env.NAME}) rather than a literal
   * secret, in which case DataConnectionSerializer echoes it back so the
   * manager's Password field can show e.g. "${env.DB_PASSWORD}" instead of
   * going blank. Absent (not just empty) when there's nothing to show.
   */
  password?: string
  /**
   * Per-type settings that don't fit the shared columns above -- see
   * backend/connections/models.py's DataConnection.config docstring for the
   * shape per type. Secret-shaped keys (secret_key, token, api_key_value,
   * oauth_client_secret, oauth_raw_body, password) come back blanked from
   * the API; leave them blank on save to keep the stored value.
   *
   * type=snowflake: passed essentially as-is to snowflake-connector-python's
   *   connect() (via the snowflake-sqlalchemy dialect). {account?, user?,
   *   password?, warehouse?, database?, schema?, role?} are the common ones
   *   (edited as named fields on the Configuration tab), but this can hold
   *   any other connect() kwarg too (e.g. authenticator,
   *   client_session_keep_alive) -- edited as JSON on the Connection
   *   settings tab, which is the exact same object. Also accepts
   *   test_query, like type=sql.
   * type=http: {auth_type: 'none'|'basic'|'api_key'|'bearer'|'oauth'|'digest',
   *   api_key_name?, api_key_value?, api_key_location?: 'header'|'query',
   *   token?, digest_algorithm?, headers?: Record<string, string>,
   *   oauth_client_id?, oauth_client_secret?, oauth_scope?,
   *   oauth_client_auth?: 'body'|'basic', oauth_body_mode?: 'form'|'json',
   *   oauth_extra_params?: Record<string, string> (form mode),
   *   oauth_raw_body?: string (json mode -- literal JSON text, may reference ${VARIABLE})}.
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
  access_type: 'http' | 's3' | 'file' | 'datastore' | 'embedded' | ''
  /**
   * source_type=query: a type=sql connection. source_type=serialized: a
   * type=http connection (access_type=http, optional) or a type=s3
   * connection (access_type=s3, required); unused for access_type=file/
   * datastore/embedded.
   */
  connection: string | null
  sql_def: string | null
  /** source_type=query only. Supports ${param} the same way the serialized fields above do (Settings fallback, dotted keys included -- ${env.NAME} too). */
  inline_sql: string
  row_limit: number | null
  /** Result cache term in seconds, keyed by datastore + all input parameters; null/0 = no caching. Cleared via POST /datastores/{id}/clear-cache/. */
  cache_seconds: number | null
  /**
   * source_type=serialized + access_type=s3: object key/path within the
   * connection's bucket, used when object_url is blank. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included, or ${env.NAME} for this server's own OS environment).
   */
  object_key: string
  /** source_type=serialized + access_type=s3 only: a full object URL, tried instead of connection+object_key when set. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included, or ${env.NAME} for this server's own OS environment). */
  object_url: string
  /**
   * source_type=serialized: the collapsible "Body" override used for test/
   * troubleshooting -- when non-blank, parsed directly instead of actually
   * fetching from access_type's configured source. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included, or ${env.NAME} for this server's own OS environment).
   */
  body: string
  /** source_type=serialized + access_type=http: the request URL, used as-is. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included, or ${env.NAME} for this server's own OS environment). */
  data_url: string
  /** source_type=serialized + access_type=http only. */
  request_method: 'GET' | 'POST'
  /** source_type=serialized + access_type=http only: key -> value query/form params. Each value supports ${param}. */
  request_params: Record<string, string>
  /** source_type=serialized + access_type=http only: raw request body (JSON/text/XML) for POST. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included, or ${env.NAME} for this server's own OS environment). */
  request_body: string
  /** source_type=serialized + access_type=file only: a directory on the server's own filesystem. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included, or ${env.NAME} for this server's own OS environment). */
  file_path: string
  /** source_type=serialized + access_type=file only: filename and/or regex selecting one file within file_path. Supports ${param} (falling back to Settings for anything a param doesn't resolve, dotted keys like ${s3.bucket} included, or ${env.NAME} for this server's own OS environment). */
  file_expression: string
  /**
   * source_type=serialized + access_type=datastore only: the id of another
   * *global* datastore whose own full output becomes this one's raw content
   * -- source_type=query there is its rows as JSON, source_type=serialized
   * is its own raw content (chains through, if that one is also
   * access_type=datastore). Always a global id -- a saved/shared datastore
   * has no panel to resolve a "local" name against (see
   * PanelDatastoreRef.source_datastore_scope for the panel-local version of
   * this). Supports ${param}.
   */
  source_datastore: string
  /** How raw content is turned into rows/columns -- see datastore/renderers.py. source_type=serialized offers none ("No Processing")/json/xml/delimited. */
  renderer_type: RendererType
  /**
   * renderer_type=json/xml: {root_path?, columns: RendererColumn[]}.
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
  /** A calendar parameter with a non-blank calendarDefaultExpr ignores this in favor of that resolved/formatted expression -- see resolveParameterDefault in utils/panelParams.ts. */
  defaultValue?: string
  /** Runtime value -- not persisted, present only on values returned to a running preview/session. */
  value?: string
  /** Participates in substitution/datastore params but is hidden from the Parameters dialog and status bar. */
  hidden?: boolean
  /**
   * selector-single/selector-multi only (see `inputType`) -- datastore name
   * (PanelContent.datastores) that supplies this parameter's options.
   * Still also honored, for backward compatibility, by a parameter with no
   * `inputType` at all set but `datastore` set -- the pre-parameters2.md
   * behavior a couple of already-saved dashboards still rely on.
   */
  datastore?: string
  /**
   * datastore only -- which of the datastore's columns supplies the actual
   * option value. Unset falls back to the first column. In the no-inputType
   * legacy fallback above, a multi-column datastore renders as a lookup
   * table (every column shown, for context) instead of a plain dropdown --
   * selectorColumn is still what a row click actually sets the parameter to.
   */
  selectorColumn?: string
  /**
   * selector-single/selector-multi only -- which column's value is shown to
   * the user in place of selectorColumn's own value (e.g. {id:1,
   * value:'test1'} with selectorColumn='id', displayColumn='value' shows
   * "test1" but the parameter is still set/stored as "1"). Blank -- shows
   * selectorColumn's own value, same as before this existed.
   */
  displayColumn?: string
  /** Also renders this parameter's own ParamField directly in the dashboard viewer's header toolbar (see PanelViewerPage.tsx), in addition to the Parameters dialog/parameters control. Applies immediately on change, same as the parameters control -- no separate "close"/Apply step. */
  addToHeader?: boolean
  /**
   * Which widget ParamField renders -- see ParametersDialog.tsx. Unset (no
   * specific Parameter type picked) is always a plain text Input, or --
   * backward compatibility only, see `datastore` above -- a native
   * select/lookup table when `datastore` happens to be set anyway.
   * 'selector-single'/'selector-multi' require `datastore` to supply
   * options -- without one they too fall back to the plain text Input.
   * 'range' and 'selector-multi' both flatten to one string
   * ("<from>,<to>" / delimiter-joined, optionally enclosure-wrapped) since
   * `value`/`defaultValue` stay a single string regardless of inputType.
   */
  inputType?: 'calendar' | 'range' | 'selector-single' | 'selector-multi' | 'toggle'
  /** inputType='range' only -- the Slider's fixed bounds/step. Unset -- 0/100/1. */
  rangeMin?: number
  rangeMax?: number
  rangeStep?: number
  /** inputType='range' only -- shows a tick mark at every step along the slider. Skipped (no ticks drawn) when that'd be more than 50 marks. */
  displayTicks?: boolean
  /** inputType='toggle' only -- "<on>|<off>", e.g. "yes|no". Blank/unset -- "true|false". */
  toggleValues?: string
  /** inputType='selector-multi' only -- joins/splits the selected values. Blank/unset -- ",". */
  selectorDelimiter?: string
  /** inputType='selector-multi' only -- wraps each selected value (e.g. 'AAPL','MSFT'), so a value containing the delimiter still round-trips. Unset -- "'". Explicitly cleared to "" -- no enclosure at all (distinct from unset; see selector-multi's encode/decode in ParametersDialog.tsx). */
  selectorEnclosure?: string
  /** inputType='calendar' only -- a date-fns format pattern. Blank/unset -- "yyyy-MM-dd". */
  calendarFormat?: string
  /**
   * inputType='calendar' only -- a relative-date expression resolved once
   * when the dashboard loads, in place of a frozen literal `defaultValue`:
   * "today", "today+N day", "today-N business day" (N an integer; business
   * day arithmetic skips Sat/Sun). Invalid/unparseable text is ignored
   * (falls back to `defaultValue`). See resolveDateExpr in utils/panelParams.ts.
   */
  calendarDefaultExpr?: string
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
  access_type?: 'http' | 's3' | 'file' | 'datastore' | 'embedded' | ''
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
  /** access_type=datastore only: the referenced datastore's `name` (not `id`) -- resolved against this same panel's own content.datastores by name, matching how every other datastore reference already works. */
  source_datastore?: string
  /** access_type=datastore only: which list `source_datastore` was picked from -- 'local' can only ever mean another entry in this same panel's own content.datastores (a saved/global Datastore has no equivalent, see Datastore.source_datastore's own doc comment). */
  source_datastore_scope?: 'global' | 'local'
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
  /** parameters only -- which of the panel's own parameters this control instance shows, and in what order (independent of the panel-wide parameters[] order). A name no longer valid (deleted/now-hidden) is silently skipped. Unset/empty -- every non-hidden panel parameter, in the panel's own order (the pre-existing behavior). */
  parameterNames?: string[]
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
  /** datatable only -- aggregates each column with a Total set (see each datatable-column's own totalExpession). totalsPosition below decides where that row renders. headerStyle/footerStyle (datatable-column / kpi-column section below) double as this table's own header-row/totals-row CSS. */
  footer?: boolean
  /** datatable only, footer=true only -- 'subheader' renders the totals row directly under the column headers instead of at the bottom. Unset -- the default "Footer" (bottom) placement. */
  totalsPosition?: 'subheader'
  stickyHeader?: boolean
  /** datatable only -- omits the column header row (and its filter/resize/pin/move affordances) from the rendered table entirely. */
  hideHeader?: boolean
  /** datatable/chart/plotly-chart/kpi/pivot -- shows the small "On demand"/"Scheduled · <last load>" corner badge (DatastoreStatusBadge). Unset/false -- hidden (the default, for every one of these control types). */
  showStatusBadge?: boolean
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
  /** datatable only -- display-only transpose: each column becomes a row and each (first 10) source row a column, headed "#1", "#2", .... Footer totals, tree rows, grouping, filters and Signal on Update are ignored while on. */
  transpose?: boolean
  /** datatable transpose only -- min width (px) of each value cell (r0..rN -- the field-name/label cell is sized by its own column's transposeHeaderMinWidth instead, see below). */
  transposeCellMinWidth?: number
  treeRows?: boolean
  treeIdField?: string
  treeParentField?: string
  /**
   * datatable only -- field names (of this table's own columns) whose
   * colorScale combine into one shared min/max range instead of each column
   * scaling against just its own values -- e.g. several numeric columns
   * meant to read on one comparable scale. A column not named here keeps
   * scaling independently (the default); a named column still needs its own
   * colorScale turned on (datatable-column's own field -- see its doc
   * comment below) to actually render colored. Comma-separated field names
   * in the editor.
   */
  colorScaleGroup?: string[]
  /**
   * datatable only -- how color scaling is scoped. Unset -- "Column" (the
   * original, pre-this-field behavior, never a stored literal): each colored
   * column scales independently against its own values across the whole
   * table, or shares a range with the rest of colorScaleGroup when set --
   * entirely managed on each datatable-column's own Color scale field, with
   * nothing to configure here. This is the backward-compatible default, so
   * an already-saved panel with colorScaleMode unset keeps coloring exactly
   * as before. 'row' scopes colorScaleGroup's shared min/max to just that
   * row's own values across the group's columns instead (e.g. highlighting
   * each row's own highest/lowest among a set of period columns, regardless
   * of how rows compare to each other). 'none' is a table-wide override that
   * suppresses all color scaling, even on a column with its own Color scale
   * turned on.
   */
  colorScaleMode?: 'none' | 'row'
  /** datatable only -- the low/mid/high palette every color-scaled column in this table uses (see datatableUtils.tsx's COLOR_SCALE_SCHEMES). Unset/unknown -- 'red-green', today's original fixed colors. */
  colorScaleScheme?: string
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
   * datatable-column only -- persistently colors each cell's background by
   * where its value falls in the column's range (Excel-style conditional
   * formatting; distinct from signalOnUpdate's transient flash on a value
   * *changing*). Works on any column whose values parse as numbers,
   * regardless of dataType (a loosely-typed datastore often leaves dataType
   * at the 'str' default even for numeric fields) -- except
   * dataType=date/datetime (a date string like "2024-01-15" would parse to
   * a meaningless 2024) or badge (categorical, not a range), which are
   * never colorable. 'sequential' interpolates a fixed low->high color
   * pair; 'diverging' adds a midpoint color, useful for a column centered
   * on zero/a target. Unset/'none' -- no coloring. See the datatable node's
   * own `colorScaleGroup` to combine several columns onto one shared range.
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
  /**
   * datatable-column, datatable's own Transpose only -- when the datatable
   * is transposed, this column becomes one row, and this styles/sizes *that
   * row's own field-name/label cell* specifically (distinct from `style`
   * above, which -- in transpose mode -- still applies to every cell in the
   * row, label cell included; this is layered on top of it there). CSS
   * declarations, same convention as `style`.
   */
  transposeHeaderStyle?: string
  /** datatable-column, datatable's own Transpose only -- min width (px) of this column's own label cell when transposed. Its text always wraps rather than clipping. */
  transposeHeaderMinWidth?: number
  totalExpession?: 'sum' | 'avg' | 'min' | 'max'
  /**
   * datatable-column only -- literal text (e.g. "Total:") shown in this
   * column's own totals-row cell, wherever totalsPosition renders it.
   * Independent of totalExpession: a label-only column (e.g. the leftmost,
   * non-aggregated one) sets just this, while a column that also aggregates
   * shows "<totalLabel> <formatted total>". Rendered even if this column
   * alone has no totalExpession, as long as the datatable's own Show Totals
   * (footer) is on and at least one column in the table has a total set.
   */
  totalLabel?: string
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
  /**
   * plotly-trace: this trace's Plotly object, authored close to verbatim as
   * JSON.parse output (plain objects/arrays/primitives, never executed as
   * code) -- any property, for any of the registered trace types ('bar',
   * 'box', 'candlestick', 'heatmap', 'histogram', 'pie', 'scatter',
   * 'surface'; anything else falls back to 'scatter'). Two template
   * conventions, applied by PlotlyChartControl.tsx's resolveTraceValue:
   *   - A string value that's *only* "#columnName#" becomes a per-row array
   *     of that datastore column's raw value (numbers stay numbers) -- what
   *     every array-valued property uses: x, y, z, open/high/low/close,
   *     labels, values, marker.size, marker.color, ...
   *   - A string mixing "#columnName#" token(s) with other text becomes a
   *     per-row array of strings, each row's copy of the template filled
   *     in -- for a formatted per-point text/hovertext.
   *   - Any other string gets ${param} substitution (unknown names left
   *     as-is) and stays a scalar -- type, mode, name, a literal color, ...
   * Two reserved top-level keys are read and stripped before the rest
   * resolves, never passed to Plotly itself: `series` (${param}-substituted;
   * only rows whose `seriesField` column equals it -- compared as strings --
   * feed this trace, blank/absent plots the entire dataset) and
   * `seriesField` (which column `series` is matched against, default
   * 'series') -- both also settable via the node's own `series`/`seriesField`
   * fields below (the Series Value/Series Column form fields); traceConfig
   * setting either here wins over that field. Deep-merged with
   * plotlyConfig.traces[i] (that wins) as a final override.
   *
   * heatmap/surface only: `x`/`y`/`z` are auto-reshaped (PlotlyChartControl
   * .tsx's gridifyTrace) from flat, equal-length arrays -- one row per (x, y)
   * cell, the same tidy shape every other trace type uses -- into the 2D
   * z grid (rows of `y`, columns of `x`) these two trace types actually
   * require; a `z` that's already a 2D array (a literal matrix authored by
   * hand) is left alone.
   */
  traceConfig?: unknown
  /**
   * plotly-trace: the Series Value/Series Column form fields -- filters this
   * trace down to the rows whose `seriesField` column (default 'series')
   * equals `series`, for splitting one dataset into multiple traces without
   * writing `series`/`seriesField` into Trace config JSON by hand (see
   * traceConfig's own doc comment above; JSON wins if it sets either).
   * `series` may reference ${param}.
   */
  series?: string
  seriesField?: string
  /**
   * plotly-trace, legacy only -- the rest of the pre-traceConfig form fields
   * this node type used to be configured through. No longer editable
   * (removed from the property schema); still typed and read by
   * PlotlyChartControl.tsx's legacyTraceConfig so an already-saved trace
   * using them keeps rendering (via a render-time synthesized traceConfig,
   * never written back) until someone rewrites it as JSON by hand. The old
   * wide/pivoted heatmap mode (yField unset) and non-heatmap xColumns pivot
   * have no #column# equivalent and aren't carried over.
   */
  xColumns?: string
  xField?: string
  yField?: string
  traceType?: string
  traceMode?: string
  colorField?: string
  sizeField?: string
  textField?: string
  lineColor?: string
  lineWidth?: number
  // --- html ---
  /** html only -- HTML, sanitized (DOMPurify -- strips <script> and on* handlers) after ${param} substitution, then rendered. Admin-authored (IsAdminOrReadOnly gates editing), same trust boundary as editing any other control. May contain ${param}, substituted on load and whenever that parameter's value changes. */
  body?: string
  // --- kpi-column ("Card") ---
  /** kpi-column: text shown in the card header (specs/kpi.md's smaller-font slot). Either an exact key of the kpi's current row (looked up and rendered as that value) or literal text with ${param} -- see resolveExpression in KpiControl.tsx. Defaults to the source field's display name when a card is generated from a sample. */
  headerValue?: string
  /** kpi-column: CSS declarations ("color: gray; font-size: 12px") applied to the header, overriding its default style. Same field-or-${param} resolution as headerValue. Also reused, same shape, by datatable: CSS declarations applied to every column header cell (no ${param} resolution there -- see buildColumns in datatableUtils.tsx). */
  headerStyle?: string
  /** kpi-column: text shown in the card body (specs/kpi.md's bold/larger-font slot). Same field-or-${param} resolution as headerValue. Defaults to the source field's own name (i.e. looked up in the row) when a card is generated from a sample. */
  bodyValue?: string
  /** kpi-column: CSS declarations applied to the body, overriding its default style. */
  bodyStyle?: string
  /** kpi-column: text shown in the card footer (specs/kpi.md's smaller-font slot) -- blank (the default) omits the footer entirely rather than rendering an empty one. */
  footerValue?: string
  /** kpi-column: CSS declarations applied to the footer, overriding its default style. Also reused, same shape, by datatable: CSS declarations applied to its totals row's cells (footer=true only), wherever totalsPosition renders it. */
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
