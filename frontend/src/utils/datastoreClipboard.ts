import type { Datastore, PanelDatastoreRef } from '../api/types'

/**
 * One datastore's definition copied to the clipboard (manager.DatastoresPanel's
 * row "Copy" and the editor's own local-datastore "Copy", see EditorPage.tsx) --
 * a single shape so either side's "Paste" can accept content copied from
 * *either* scope, per specs: copy a shared global datastore and paste it as
 * a new panel-local one, or copy a panel-local one and paste it as a new
 * shared global row. `scope` records which flavor the content was copied
 * from; `global` carries the global-only settings (cache/API mode/refresh/
 * roles) and is only ever present when `scope: 'global'` -- a local
 * datastore has none of those to lose when copied.
 *
 * `__datastore_clipboard` distinguishes this from the handful of *other*
 * JSON shapes this app also round-trips through the OS clipboard (a tree
 * node, a parameter, a link) -- see isDatastoreClipboardEntry.
 */
export interface DatastoreClipboardEntry {
  __datastore_clipboard: true
  /** The copied datastore's own name/id -- offered back as the suggested name on paste. */
  name: string
  scope: 'global' | 'local'
  source_type: 'query' | 'serialized'
  access_type: Datastore['access_type']
  connection: string | null | undefined
  inline_sql: string
  row_limit: number | null | undefined
  object_key: string
  object_url: string
  body: string
  data_url: string
  request_method: 'GET' | 'POST'
  request_params: Record<string, string>
  request_body: string
  file_path: string
  file_expression: string
  renderer_type: Datastore['renderer_type']
  renderer_config: Record<string, unknown>
  source_datastore: string
  /** scope='local' source only -- see PanelDatastoreRef.source_datastore_scope. A scope='global' entry's own source_datastore (if any) is always itself global, since a shared Datastore row has no panel to resolve a local name against. */
  source_datastore_scope?: 'global' | 'local'
  default_params: Record<string, string>
  /** Present only when scope='global'. */
  global?: {
    cache_seconds: number | null
    api_mode: Datastore['api_mode']
    refresh_mode: Datastore['refresh_mode']
    cron_schedule: string
    idle_timeout_seconds: number | null
    allowed_roles: number[]
  }
}

/** manager.DatastoresPanel's row "Copy" -- a shared global Datastore row, full definition included. */
export function datastoreToClipboard(ds: Datastore): DatastoreClipboardEntry {
  return {
    __datastore_clipboard: true,
    name: ds.id,
    scope: 'global',
    source_type: ds.source_type,
    access_type: ds.access_type,
    connection: ds.connection,
    inline_sql: ds.inline_sql,
    row_limit: ds.row_limit,
    object_key: ds.object_key,
    object_url: ds.object_url,
    body: ds.body,
    data_url: ds.data_url,
    request_method: ds.request_method,
    request_params: ds.request_params,
    request_body: ds.request_body,
    file_path: ds.file_path,
    file_expression: ds.file_expression,
    renderer_type: ds.renderer_type,
    renderer_config: ds.renderer_config,
    source_datastore: ds.source_datastore,
    default_params: Object.fromEntries(Object.entries(ds.default_params ?? {}).map(([k, v]) => [k, String(v)])),
    global: {
      cache_seconds: ds.cache_seconds,
      api_mode: ds.api_mode,
      refresh_mode: ds.refresh_mode,
      cron_schedule: ds.cron_schedule,
      idle_timeout_seconds: ds.idle_timeout_seconds,
      allowed_roles: ds.allowed_roles,
    },
  }
}

/** The editor's own local-datastore "Copy" (ComponentTree's Datastores section) -- a panel-local PanelDatastoreRef. */
export function localRefToClipboard(ref: PanelDatastoreRef): DatastoreClipboardEntry {
  return {
    __datastore_clipboard: true,
    name: ref.name,
    scope: 'local',
    source_type: ref.source_type ?? 'query',
    access_type: ref.access_type ?? '',
    connection: ref.connection,
    inline_sql: ref.inline_sql ?? '',
    row_limit: ref.row_limit,
    object_key: ref.object_key ?? '',
    object_url: ref.object_url ?? '',
    body: ref.body ?? '',
    data_url: ref.data_url ?? '',
    request_method: ref.request_method ?? 'GET',
    request_params: ref.request_params ?? {},
    request_body: ref.request_body ?? '',
    file_path: ref.file_path ?? '',
    file_expression: ref.file_expression ?? '',
    renderer_type: ref.renderer_type ?? 'none',
    renderer_config: ref.renderer_config ?? {},
    source_datastore: ref.source_datastore ?? '',
    source_datastore_scope: ref.source_datastore_scope,
    default_params: ref.default_params ?? {},
  }
}

/** Type guard for clipboard JSON written by either of the functions above. */
export function isDatastoreClipboardEntry(value: unknown): value is DatastoreClipboardEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as Partial<DatastoreClipboardEntry>
  return e.__datastore_clipboard === true && typeof e.name === 'string' && (e.scope === 'global' || e.scope === 'local')
}

/**
 * Builds a panel-local PanelDatastoreRef from clipboard content copied from
 * *either* scope -- the editor's "Paste" always lands in a panel's own
 * content.datastores, so this is the only paste-side conversion it needs.
 */
export function clipboardToLocalRef(entry: DatastoreClipboardEntry, id: string, name: string): PanelDatastoreRef {
  return {
    id,
    name,
    scope: 'local',
    source_type: entry.source_type,
    access_type: entry.access_type,
    connection: entry.connection ?? undefined,
    inline_sql: entry.inline_sql,
    row_limit: entry.row_limit ?? undefined,
    object_key: entry.object_key,
    object_url: entry.object_url,
    body: entry.body,
    data_url: entry.data_url,
    request_method: entry.request_method,
    request_params: entry.request_params,
    request_body: entry.request_body,
    file_path: entry.file_path,
    file_expression: entry.file_expression,
    renderer_type: entry.renderer_type,
    renderer_config: entry.renderer_config,
    source_datastore: entry.source_datastore,
    // A copied global row's own source_datastore (if any) was necessarily
    // itself global -- see DatastoreClipboardEntry.source_datastore_scope.
    // A copied local row's scope carries over as-is (and may not resolve if
    // the destination panel has no same-named local sibling, same existing
    // caveat local-to-local paste already has).
    source_datastore_scope: entry.scope === 'global' ? (entry.source_datastore ? 'global' : undefined) : entry.source_datastore_scope,
    default_params: entry.default_params,
  }
}

/**
 * Builds a POST /datastores/ payload (same shape as DatastoreDialog's own
 * buildPayload) from clipboard content copied from *either* scope --
 * manager.DatastoresPanel's "Paste" always creates a new shared global row.
 * A copied local entry has no global-only settings (cache/API mode/refresh/
 * roles) to carry over, so those fall back to their own normal defaults.
 */
export function clipboardToGlobalPayload(entry: DatastoreClipboardEntry, id: string): Record<string, unknown> {
  const g = entry.global
  return {
    id,
    source_type: entry.source_type,
    access_type: entry.access_type,
    connection: entry.connection || null,
    sql_def: null,
    inline_sql: entry.inline_sql,
    row_limit: entry.row_limit ?? null,
    cache_seconds: g?.cache_seconds ?? null,
    object_key: entry.object_key,
    object_url: entry.object_url,
    body: entry.body,
    data_url: entry.data_url,
    request_method: entry.request_method,
    request_params: entry.request_params,
    request_body: entry.request_body,
    file_path: entry.file_path,
    file_expression: entry.file_expression,
    renderer_type: entry.renderer_type,
    renderer_config: entry.renderer_config,
    // A global Datastore row can only reference another *global* source (no
    // panel to resolve a local name against) -- drop a copied local entry's
    // source_datastore unless it already named a global sibling itself.
    source_datastore: entry.scope === 'global' || entry.source_datastore_scope === 'global' ? entry.source_datastore : '',
    default_params: entry.default_params,
    api_mode: g?.api_mode ?? 'none',
    refresh_mode: g?.refresh_mode ?? 'on_demand',
    cron_schedule: g?.cron_schedule ?? '',
    idle_timeout_seconds: g?.idle_timeout_seconds ?? null,
    allowed_roles: g?.allowed_roles ?? [],
  }
}

/**
 * Shared clipboard-read step for a datastore "Paste" action -- throws a
 * plain Error with a user-facing message on denied access or invalid JSON/
 * shape (same `catch (err) { toast.error(String(err)) }` idiom every other
 * manager panel's own async handlers already use), otherwise resolves to a
 * validated DatastoreClipboardEntry.
 */
export async function readDatastoreClipboard(): Promise<DatastoreClipboardEntry> {
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    throw new Error('Clipboard access was denied.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("Clipboard doesn't contain valid JSON.")
  }
  if (!isDatastoreClipboardEntry(parsed)) {
    throw new Error("Clipboard doesn't contain a datastore.")
  }
  return parsed
}
