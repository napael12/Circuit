import { useEffect, useMemo, useState } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { ChevronRight, Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/Field'
import { cn } from '@/lib/utils'

import { dataGridFeatures, type DataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import { api } from '../../api/client'
import type { DataConnection, Datastore, DatastorePreviewResult, PanelDatastoreRef, RendererType, Role } from '../../api/types'
import { localDatastoresPayload } from '../../utils/localDatastores'
import { discoverAllParams } from '../../utils/sqlParams'
import { newId } from '../editor/panelTree'
import { RoleMultiSelect } from './RoleMultiSelect'
import { DatastorePreviewPanel } from './DatastorePreviewPanel'
import { SerializedDataFields, type DatastoreRefOption } from './SerializedDataFields'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'

interface Option {
  value: string
  label: string
}

interface Props {
  /**
   * null = creating a new datastore. scope='local' callers (DatastoreRefDialog)
   * adapt their PanelDatastoreRef into this shape (see refToDatastore there)
   * and tack on `source_datastore_scope`, which has no equivalent on a global
   * Datastore row -- see Datastore.source_datastore's own doc comment.
   */
  initial: (Datastore & { source_datastore_scope?: 'global' | 'local' }) | null
  connections: DataConnection[]
  /** Unused (and unnecessary to fetch) when scope='local' -- Access roles don't apply there. */
  roles?: Role[]
  initialTab?: 'edit' | 'preview'
  /**
   * 'global' (default): saved as a shared datastore.models.Datastore row via
   * the Manager API. 'local': embedded in a panel's own JSON instead (see
   * PanelDatastoreRef) -- used by editor.DatastoreRefDialog so panels get
   * the exact same editing experience as the Manager's global datastores,
   * minus the sections that don't apply to a panel-local binding (Access
   * roles, API mode, Refresh mode -- always on-demand).
   */
  scope?: 'global' | 'local'
  /** scope='local' only: the PanelDatastoreRef.id to preserve across edits (a new one is minted when absent). */
  localId?: string
  onClose: () => void
  /** scope='global' only. */
  onSaved?: () => void
  /** scope='local' only: receives the built PanelDatastoreRef instead of an API call being made. */
  onSaveLocal?: (ref: PanelDatastoreRef) => void
  /**
   * Every other datastore this one could reference via Accessing Data =
   * 'Datastore' (self already excluded by the caller). scope='global'
   * callers only ever have scope='global' entries to offer (a saved/global
   * Datastore row has no panel to resolve a local name against); the
   * editor's DatastoreRefDialog passes both scopes.
   */
  availableDatastoreRefs?: DatastoreRefOption[]
  /**
   * scope='local' only: this panel's own content.datastores, so the Preview
   * tab can send them along as `local_datastores` -- when this (possibly
   * still-unsaved) datastore's own Accessing Data = 'Datastore' names a
   * *local* sibling, that sibling has no saved row to resolve against
   * either, so its in-progress definition has to ride along too (see
   * backend datastore.views.DatastoreViewSet.preview_config).
   */
  localSiblings?: PanelDatastoreRef[]
}

interface ParamRow {
  variable: string
  value: string
  /** Found live in the query/config text -- its name isn't editable (renaming here wouldn't rename it there). */
  discovered: boolean
}

const SOURCE_TYPE_OPTIONS: { value: Datastore['source_type']; label: string }[] = [
  { value: 'query', label: 'SQL query' },
  { value: 'serialized', label: 'Serialized Data' },
]

/**
 * Global (Manager-managed) datastore editor -- SQL query or Serialized Data
 * (specs/datasource_enhancements.md, specs/serialized-datastore.md). :name /
 * ${name} variables are derived live from whichever fields are relevant to
 * the current type and edited as default values in a data grid. Edit/
 * Preview share one dialog via tabs instead of Preview opening a second
 * modal.
 */
export function DatastoreDialog({
  initial,
  connections,
  roles = [],
  initialTab = 'edit',
  scope = 'global',
  localId,
  onClose,
  onSaved,
  onSaveLocal,
  availableDatastoreRefs = [],
  localSiblings = [],
}: Props) {
  const isEdit = initial !== null
  const isLocal = scope === 'local'
  const [tab, setTab] = useState<'edit' | 'dataflow' | 'permissions' | 'preview'>(initialTab)
  const [id, setId] = useState(initial?.id ?? '')
  const [sourceType, setSourceType] = useState<Datastore['source_type']>(initial?.source_type ?? 'query')
  const [connection, setConnection] = useState(initial?.connection ?? '')
  const [inlineSql, setInlineSql] = useState(initial?.inline_sql ?? '')
  const [rowLimit, setRowLimit] = useState<number | ''>(initial?.row_limit ?? '')
  const [cacheSeconds, setCacheSeconds] = useState<number | ''>(initial?.cache_seconds ?? '')
  const [objectKey, setObjectKey] = useState(initial?.object_key ?? '')
  const [objectUrl, setObjectUrl] = useState(initial?.object_url ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [bodyOpen, setBodyOpen] = useState(!!initial?.body)
  const [dataUrl, setDataUrl] = useState(initial?.data_url ?? '')
  const [accessType, setAccessType] = useState<Datastore['access_type']>(initial?.access_type || 'http')
  const [requestMethod, setRequestMethod] = useState<Datastore['request_method']>(initial?.request_method ?? 'GET')
  const [requestParams, setRequestParams] = useState<Record<string, string>>(initial?.request_params ?? {})
  const [requestBody, setRequestBody] = useState(initial?.request_body ?? '')
  const [filePath, setFilePath] = useState(initial?.file_path ?? '')
  const [fileExpression, setFileExpression] = useState(initial?.file_expression ?? '')
  // 'json' is a sensible default for a brand-new serialized datastore;
  // editing an existing one always shows whatever was actually saved,
  // including 'none' (No Processing).
  const [rendererType, setRendererType] = useState<RendererType>(initial?.renderer_type ?? 'json')
  const [rendererConfig, setRendererConfig] = useState<Record<string, unknown>>(initial?.renderer_config ?? {})
  const [sourceDatastore, setSourceDatastore] = useState(initial?.source_datastore ?? '')
  const [sourceDatastoreScope, setSourceDatastoreScope] = useState<'global' | 'local'>(
    initial?.source_datastore_scope ?? 'global',
  )
  // Push posts a raw JSON body straight through the JSON renderer
  // (breadboard.public_api.PushDatastoreView) -- only while this datastore's
  // own renderer is JSON.
  const pushEligible = sourceType === 'serialized' && rendererType === 'json'
  const [apiMode, setApiMode] = useState<Datastore['api_mode']>(initial?.api_mode ?? 'none')
  const [refreshMode, setRefreshMode] = useState<Datastore['refresh_mode']>(initial?.refresh_mode ?? 'on_demand')
  const [cronSchedule, setCronSchedule] = useState(initial?.cron_schedule ?? '')
  const [idleTimeoutSeconds, setIdleTimeoutSeconds] = useState<number | ''>(initial?.idle_timeout_seconds ?? 60)
  const [defaultParams, setDefaultParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial?.default_params ?? {}).map(([k, v]) => [k, String(v)])),
  )
  const [paramsOpen, setParamsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allowedRoles, setAllowedRoles] = useState<number[]>(initial?.allowed_roles ?? [])

  // Only the Type selector (new, un-saved datastores) can make a currently-
  // open tab vanish (Data Flow only exists for sourceType='serialized') --
  // fall back to Configuration rather than leaving the Tabs on a value with
  // no matching trigger/content.
  useEffect(() => {
    if (tab === 'dataflow' && sourceType !== 'serialized') setTab('edit')
  }, [tab, sourceType])

  const connectionOptions = useMemo<Option[]>(() => {
    // source_type='query' accepts either SQL flavor -- a Snowflake connection
    // is queried exactly the same way (datastore.engine), just configured
    // differently (see connections/backends.py's SnowflakeConnectionBackend).
    const allowedTypes: DataConnection['type'][] =
      sourceType === 'serialized'
        ? accessType === 's3'
          ? ['s3']
          : accessType === 'http'
            ? ['http']
            : []
        : sourceType === 'query'
          ? ['sql', 'snowflake']
          : []
    if (allowedTypes.length === 0) return []
    return connections.filter((c) => allowedTypes.includes(c.type)).map((c) => ({ value: c.id, label: c.id }))
  }, [connections, sourceType, accessType])

  // specs/permissions.md #2a: a restricted connection's roles cascade to any
  // datastore built on it -- mirrors backend/datastore/roles.py so the
  // picker never shows a value the save would silently override.
  const effectiveConnection = useMemo(() => {
    return connections.find((c) => c.id === connection) ?? null
  }, [connections, connection])
  const inheritedRoleIds = effectiveConnection?.allowed_roles ?? []
  const rolesLocked = inheritedRoleIds.length > 0
  const displayedRoleIds = rolesLocked ? inheritedRoleIds : allowedRoles

  // Excludes this datastore itself from its own "Datastore" access-type
  // picker -- compared by (scope, name) since 'id' changes live as the
  // Name field is edited.
  const filteredDatastoreRefs = useMemo(
    () => availableDatastoreRefs.filter((r) => !(r.scope === scope && r.name === id)),
    [availableDatastoreRefs, scope, id],
  )

  const discoveredParamNames = useMemo(() => {
    const sources = [
      inlineSql,
      objectKey,
      objectUrl,
      body,
      dataUrl,
      requestBody,
      filePath,
      fileExpression,
      sourceDatastore,
      JSON.stringify(requestParams),
      JSON.stringify(rendererConfig),
    ]
    return new Set(discoverAllParams(...sources))
  }, [
    inlineSql, objectKey, objectUrl, body, dataUrl, requestBody, filePath, fileExpression,
    sourceDatastore, requestParams, rendererConfig,
  ])

  const paramRows = useMemo<ParamRow[]>(() => {
    const names = new Set([...discoveredParamNames, ...Object.keys(defaultParams)])
    return Array.from(names).map((variable) => ({
      variable,
      value: defaultParams[variable] ?? '',
      discovered: discoveredParamNames.has(variable),
    }))
  }, [discoveredParamNames, defaultParams])

  const handleAddParam = () => {
    setDefaultParams((d) => {
      let i = Object.keys(d).length + discoveredParamNames.size + 1
      let key = `param${i}`
      while (key in d || discoveredParamNames.has(key)) {
        i += 1
        key = `param${i}`
      }
      return { ...d, [key]: '' }
    })
  }

  const handleRenameParam = (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    setDefaultParams((d) => {
      const { [oldName]: value, ...rest } = d
      return { ...rest, [trimmed]: value ?? '' }
    })
  }

  const handleDeleteParam = (name: string) => {
    setDefaultParams((d) => {
      const { [name]: _removed, ...rest } = d
      return rest
    })
  }

  const paramColumns = useMemo<ColumnDef<DataGridFeatures, ParamRow>[]>(
    () => [
      {
        id: 'variable',
        accessorKey: 'variable',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Variable" />,
        cell: ({ row, getValue }) =>
          row.original.discovered ? (
            <span className="font-mono text-[0.85em]">{String(getValue())}</span>
          ) : (
            <Input
              defaultValue={String(getValue())}
              onBlur={(e) => handleRenameParam(row.original.variable, e.target.value)}
              className="h-7 font-mono text-[0.85em]"
            />
          ),
      },
      {
        id: 'value',
        accessorKey: 'value',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Default value" />,
        cell: ({ row, getValue }) => (
          <Input
            value={String(getValue() ?? '')}
            onChange={(e) => setDefaultParams((d) => ({ ...d, [row.original.variable]: e.target.value }))}
            className="h-7 text-[0.85em]"
          />
        ),
      },
      {
        id: '__actions',
        header: '',
        size: 40,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteParam(row.original.variable)}>
            <Trash2 />
          </Button>
        ),
      },
    ],
    [],
  )
  const paramTable = useTable({
    features: dataGridFeatures,
    columns: paramColumns,
    data: paramRows,
    getRowId: (row) => row.variable,
    initialState: managerGridInitialState,
  })

  // accessType='embedded' means `body` *is* the configured source (always
  // sent, no toggle needed, see SerializedDataFields' Content field) --
  // every other access type keeps the collapsible test-override behavior
  // (only sent while the user has it open).
  const includeBody = bodyOpen || accessType === 'embedded'

  const buildPayload = () => ({
    id,
    source_type: sourceType,
    access_type: sourceType === 'serialized' ? accessType : '',
    connection: connection || null,
    sql_def: null,
    inline_sql: sourceType === 'query' ? inlineSql : '',
    row_limit: rowLimit === '' ? null : rowLimit,
    cache_seconds: isLocal || cacheSeconds === '' ? null : cacheSeconds,
    object_key: sourceType === 'serialized' && accessType === 's3' ? objectKey : '',
    object_url: sourceType === 'serialized' && accessType === 's3' ? objectUrl : '',
    body: sourceType === 'serialized' && includeBody ? body : '',
    data_url: sourceType === 'serialized' && accessType === 'http' ? dataUrl : '',
    request_method: sourceType === 'serialized' && accessType === 'http' ? requestMethod : 'GET',
    request_params: sourceType === 'serialized' && accessType === 'http' ? requestParams : {},
    request_body:
      sourceType === 'serialized' && accessType === 'http' && requestMethod === 'POST' ? requestBody : '',
    file_path: sourceType === 'serialized' && accessType === 'file' ? filePath : '',
    file_expression: sourceType === 'serialized' && accessType === 'file' ? fileExpression : '',
    renderer_type: sourceType === 'serialized' ? rendererType : 'none',
    renderer_config: sourceType === 'serialized' ? rendererConfig : {},
    source_datastore: sourceType === 'serialized' && accessType === 'datastore' ? sourceDatastore : '',
    default_params: defaultParams,
    // Push is only ever meaningful for serialized datastores using the JSON
    // renderer (enforced again server-side in DatastoreSerializer.validate)
    // -- force back to 'none' if the renderer was changed away from that
    // while Push was selected.
    api_mode: apiMode === 'push' && !pushEligible ? 'none' : apiMode,
    refresh_mode: refreshMode,
    cron_schedule: cronSchedule,
    idle_timeout_seconds: refreshMode === 'scheduled' ? (idleTimeoutSeconds === '' ? null : idleTimeoutSeconds) : null,
    // Sent as-is when unrestricted; the backend forces this to the
    // effective connection's roles whenever that connection is restricted
    // (datastore.roles.apply_cascaded_roles), same as rolesLocked below.
    allowed_roles: allowedRoles,
  })

  const copyApiUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/api/v1/datastores/${id}/${apiMode}/`)
      toast.success('URL copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }

  const buildLocalRef = (): PanelDatastoreRef => ({
    id: localId ?? newId('ds'),
    name: id,
    scope: 'local',
    source_type: sourceType,
    access_type: sourceType === 'serialized' ? accessType : '',
    connection: connection || undefined,
    inline_sql: sourceType === 'query' ? inlineSql : '',
    row_limit: rowLimit === '' ? undefined : rowLimit,
    object_key: sourceType === 'serialized' && accessType === 's3' ? objectKey : '',
    object_url: sourceType === 'serialized' && accessType === 's3' ? objectUrl : '',
    body: sourceType === 'serialized' && includeBody ? body : '',
    data_url: sourceType === 'serialized' && accessType === 'http' ? dataUrl : '',
    request_method: sourceType === 'serialized' && accessType === 'http' ? requestMethod : 'GET',
    request_params: sourceType === 'serialized' && accessType === 'http' ? requestParams : {},
    request_body:
      sourceType === 'serialized' && accessType === 'http' && requestMethod === 'POST' ? requestBody : '',
    file_path: sourceType === 'serialized' && accessType === 'file' ? filePath : '',
    file_expression: sourceType === 'serialized' && accessType === 'file' ? fileExpression : '',
    renderer_type: sourceType === 'serialized' ? rendererType : 'none',
    renderer_config: sourceType === 'serialized' ? rendererConfig : {},
    source_datastore: sourceType === 'serialized' && accessType === 'datastore' ? sourceDatastore : undefined,
    source_datastore_scope: sourceType === 'serialized' && accessType === 'datastore' ? sourceDatastoreScope : undefined,
    default_params: defaultParams,
  })

  const handleSave = async () => {
    if (isLocal) {
      onSaveLocal?.(buildLocalRef())
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.patch(`/datastores/${id}/`, buildPayload())
      } else {
        await api.post('/datastores/', buildPayload())
      }
      toast.success('Saved.')
      onSaved?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'flex h-[640px] max-h-[calc(100vh-4rem)] w-[960px] max-w-[calc(100vw-4rem)]',
          'min-h-[420px] min-w-[560px] flex-col resize overflow-hidden sm:max-w-[calc(100vw-4rem)]',
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="flex-1 truncate">{isEdit ? id : isLocal ? 'New local datastore' : 'New Datastore'}</span>
            {isEdit && (
              <Badge variant="secondary" className="shrink-0 font-normal">
                {SOURCE_TYPE_OPTIONS.find((opt) => opt.value === sourceType)?.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'edit' | 'dataflow' | 'permissions' | 'preview')}
          className="min-h-0 min-w-0 flex-1 gap-3"
        >
          <TabsList variant="line">
            <TabsTrigger value="edit">Configuration</TabsTrigger>
            {sourceType === 'serialized' && <TabsTrigger value="dataflow">Data Flow</TabsTrigger>}
            {!isLocal && <TabsTrigger value="permissions">Permissions</TabsTrigger>}
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto py-1">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Name"
                helperText={
                  isLocal
                    ? 'How components on this panel reference it'
                    : 'Letters, numbers, hyphens/underscores -- also the id, like connections'
                }
              >
                <Input
                  value={id}
                  disabled={isEdit}
                  onChange={(e) => setId(e.target.value)}
                  className="h-8 text-[0.85em]"
                />
              </Field>
              {!isEdit && (
                <Field label="Type">
                  <Select
                    value={sourceType}
                    onValueChange={(v) => setSourceType(v as Datastore['source_type'])}
                  >
                    <SelectTrigger className="h-8 w-full text-[0.85em]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {sourceType === 'query' && (
                <Field label="SQL connection">
                  <Select value={connection} onValueChange={setConnection}>
                    <SelectTrigger className="h-8 w-full text-[0.85em]">
                      <SelectValue placeholder="none" />
                    </SelectTrigger>
                    <SelectContent>
                      {connectionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>

            {sourceType === 'query' && (
              <Field label="Query" helperText='Use :paramname bind variables, or ${paramname} to substitute the value directly into the text'>
                <Textarea
                  rows={4}
                  value={inlineSql}
                  onChange={(e) => setInlineSql(e.target.value)}
                  className="font-mono text-[0.85em]"
                />
              </Field>
            )}

            <Field label="Row limit" helperText="Max rows/records returned per call">
              <Input
                type="number"
                value={rowLimit}
                onChange={(e) => setRowLimit(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-8 text-[0.85em]"
              />
            </Field>

            {!isLocal && (
              <>
                <Field
                  label="Cache (seconds)"
                  helperText="Reuse results for this many seconds, per distinct set of input parameters. Blank or 0 = no caching. Use Clear cache in the datastore's row menu to drop it early"
                >
                  <Input
                    type="number"
                    min={0}
                    value={cacheSeconds}
                    onChange={(e) => setCacheSeconds(e.target.value === '' ? '' : Number(e.target.value))}
                    className="h-8 text-[0.85em]"
                  />
                </Field>
                <Field
                  label="API mode"
                  helperText={
                    apiMode === 'push'
                      ? 'Refresh mode is ignored while Push is enabled -- data arrives via the push API call instead.'
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2">
                    <Select value={apiMode} onValueChange={(v) => setApiMode(v as Datastore['api_mode'])}>
                      <SelectTrigger className="h-8 flex-1 text-[0.85em]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Disabled</SelectItem>
                        <SelectItem value="pull">Pull</SelectItem>
                        <SelectItem value="push" disabled={!pushEligible}>
                          Push{!pushEligible ? ' (Serialized Data with the JSON renderer only)' : ''}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {apiMode !== 'none' && id && (
                      <Button variant="outline" size="sm" onClick={copyApiUrl}>
                        <Copy />
                        Copy URL
                      </Button>
                    )}
                  </div>
                </Field>
                <Field label="Refresh mode" helperText={apiMode === 'push' ? 'Ignored while API mode is Push.' : undefined}>
                  <Select value={refreshMode} onValueChange={(v) => setRefreshMode(v as Datastore['refresh_mode'])}>
                    <SelectTrigger className="h-8 w-full text-[0.85em]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on_demand">On demand</SelectItem>
                      <SelectItem value="scheduled">Scheduled (cron)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {refreshMode === 'scheduled' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Cron schedule" helperText='"minute hour day month day_of_week"'>
                      <Input value={cronSchedule} onChange={(e) => setCronSchedule(e.target.value)} className="h-8 text-[0.85em]" />
                    </Field>
                    <Field
                      label="Idle timeout (seconds)"
                      helperText="Stop refreshing once no dashboard has this open for this long. 0 = never stop."
                    >
                      <Input
                        type="number"
                        min={0}
                        value={idleTimeoutSeconds}
                        onChange={(e) => setIdleTimeoutSeconds(e.target.value === '' ? '' : Number(e.target.value))}
                        className="h-8 text-[0.85em]"
                      />
                    </Field>
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => setParamsOpen((v) => !v)}
              className="flex items-center gap-1 self-start text-[0.8em] text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={cn('size-3.5 transition-transform', paramsOpen && 'rotate-90')} />
              Default parameter values{paramRows.length > 0 ? ` (${paramRows.length})` : ''}
            </button>
            {paramsOpen && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
                {paramRows.length > 0 ? (
                  <ManagerGrid className="max-h-[320px]" table={paramTable} recordCount={paramRows.length} />
                ) : (
                  <p className="text-[0.78em] text-muted-foreground">
                    No :name or ${'{name}'} variables found in this datastore's configuration -- add one below to
                    predefine a default.
                  </p>
                )}
                <Button variant="outline" size="sm" className="self-start" onClick={handleAddParam}>
                  <Plus />
                  Add parameter
                </Button>
              </div>
            )}
          </TabsContent>

          {sourceType === 'serialized' && (
            <TabsContent value="dataflow" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto py-1">
              <SerializedDataFields
                accessType={accessType}
                onAccessTypeChange={setAccessType}
                connectionOptions={connectionOptions}
                connection={connection}
                onConnectionChange={setConnection}
                dataUrl={dataUrl}
                onDataUrlChange={setDataUrl}
                requestMethod={requestMethod}
                onRequestMethodChange={setRequestMethod}
                requestParams={requestParams}
                onRequestParamsChange={setRequestParams}
                requestBody={requestBody}
                onRequestBodyChange={setRequestBody}
                objectKey={objectKey}
                onObjectKeyChange={setObjectKey}
                objectUrl={objectUrl}
                onObjectUrlChange={setObjectUrl}
                filePath={filePath}
                onFilePathChange={setFilePath}
                fileExpression={fileExpression}
                onFileExpressionChange={setFileExpression}
                rendererType={rendererType}
                rendererConfig={rendererConfig}
                onRendererChange={(t, c) => {
                  setRendererType(t)
                  setRendererConfig(c)
                }}
                body={body}
                onBodyChange={setBody}
                bodyOpen={bodyOpen}
                onBodyOpenChange={setBodyOpen}
                sourceDatastore={sourceDatastore}
                onSourceDatastoreChange={setSourceDatastore}
                sourceDatastoreScope={sourceDatastoreScope}
                onSourceDatastoreScopeChange={setSourceDatastoreScope}
                availableDatastoreRefs={filteredDatastoreRefs}
              />
            </TabsContent>
          )}

          {!isLocal && (
            <TabsContent value="permissions" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto py-1">
              <RoleMultiSelect
                roles={roles}
                value={displayedRoleIds}
                onChange={setAllowedRoles}
                disabled={rolesLocked}
                listClassName="h-80"
                helperText={
                  rolesLocked
                    ? `Inherited from connection "${effectiveConnection?.id}" -- edit its access roles to change this.`
                    : undefined
                }
              />
            </TabsContent>
          )}

          <TabsContent value="preview" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <DatastorePreviewPanel
              initialParams={Object.fromEntries(paramRows.map((r) => [r.variable, r.value]))}
              onRun={(params, limit) =>
                api.post<DatastorePreviewResult>('/datastores/preview-config/', {
                  ...buildPayload(),
                  params,
                  limit,
                  local_datastores: isLocal ? localDatastoresPayload(localSiblings) : undefined,
                })
              }
              name={id}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
