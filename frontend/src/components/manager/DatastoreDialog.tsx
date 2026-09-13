import { useMemo, useState } from 'react'
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

import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import { DataGridTable } from '../reui/data-grid/data-grid-table'
import { api } from '../../api/client'
import type { DataConnection, Datastore, DatastorePreviewResult, PanelDatastoreRef, RendererType, Role } from '../../api/types'
import { discoverAllParams } from '../../utils/sqlParams'
import { newId } from '../editor/panelTree'
import { RoleMultiSelect } from './RoleMultiSelect'
import { DatastorePreviewPanel } from './DatastorePreviewPanel'
import { SerializedDataFields } from './SerializedDataFields'

interface Option {
  value: string
  label: string
}

interface Props {
  /** null = creating a new datastore. */
  initial: Datastore | null
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
}: Props) {
  const isEdit = initial !== null
  const isLocal = scope === 'local'
  const [tab, setTab] = useState<'edit' | 'preview'>(initialTab)
  const [id, setId] = useState(initial?.id ?? '')
  const [sourceType, setSourceType] = useState<Datastore['source_type']>(initial?.source_type ?? 'query')
  const [connection, setConnection] = useState(initial?.connection ?? '')
  const [inlineSql, setInlineSql] = useState(initial?.inline_sql ?? '')
  const [rowLimit, setRowLimit] = useState<number | ''>(initial?.row_limit ?? '')
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
  const [rendererType, setRendererType] = useState<RendererType>(initial?.renderer_type ?? 'none')
  const [rendererConfig, setRendererConfig] = useState<Record<string, unknown>>(initial?.renderer_config ?? {})
  // source_type=serialized only offers json/xml/delimited (no "None" option)
  // -- a brand-new serialized datastore starts at renderer_type='none', so
  // this is what's actually shown/saved until the user picks one explicitly.
  const effectiveRendererType = sourceType === 'serialized' && rendererType === 'none' ? 'json' : rendererType
  // Push posts a raw JSON body straight through the JSON renderer
  // (breadboard.public_api.PushDatastoreView) -- only while this datastore's
  // own renderer is JSON.
  const pushEligible = sourceType === 'serialized' && effectiveRendererType === 'json'
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

  const connectionOptions = useMemo<Option[]>(() => {
    const type =
      sourceType === 'serialized'
        ? accessType === 's3'
          ? 's3'
          : accessType === 'http'
            ? 'http'
            : undefined
        : sourceType === 'query'
          ? 'sql'
          : undefined
    if (!type) return []
    return connections.filter((c) => c.type === type).map((c) => ({ value: c.id, label: c.id }))
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
      JSON.stringify(requestParams),
      JSON.stringify(rendererConfig),
    ]
    return new Set(discoverAllParams(...sources))
  }, [inlineSql, objectKey, objectUrl, body, dataUrl, requestBody, filePath, fileExpression, requestParams, rendererConfig])

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
  })

  const buildPayload = () => ({
    id,
    source_type: sourceType,
    access_type: sourceType === 'serialized' ? accessType : '',
    connection: connection || null,
    sql_def: null,
    inline_sql: sourceType === 'query' ? inlineSql : '',
    row_limit: rowLimit === '' ? null : rowLimit,
    object_key: sourceType === 'serialized' && accessType === 's3' ? objectKey : '',
    object_url: sourceType === 'serialized' && accessType === 's3' ? objectUrl : '',
    body: sourceType === 'serialized' && bodyOpen ? body : '',
    data_url: sourceType === 'serialized' && accessType === 'http' ? dataUrl : '',
    request_method: sourceType === 'serialized' && accessType === 'http' ? requestMethod : 'GET',
    request_params: sourceType === 'serialized' && accessType === 'http' ? requestParams : {},
    request_body:
      sourceType === 'serialized' && accessType === 'http' && requestMethod === 'POST' ? requestBody : '',
    file_path: sourceType === 'serialized' && accessType === 'file' ? filePath : '',
    file_expression: sourceType === 'serialized' && accessType === 'file' ? fileExpression : '',
    renderer_type: sourceType === 'serialized' ? effectiveRendererType : 'none',
    renderer_config: sourceType === 'serialized' ? rendererConfig : {},
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
    body: sourceType === 'serialized' && bodyOpen ? body : '',
    data_url: sourceType === 'serialized' && accessType === 'http' ? dataUrl : '',
    request_method: sourceType === 'serialized' && accessType === 'http' ? requestMethod : 'GET',
    request_params: sourceType === 'serialized' && accessType === 'http' ? requestParams : {},
    request_body:
      sourceType === 'serialized' && accessType === 'http' && requestMethod === 'POST' ? requestBody : '',
    file_path: sourceType === 'serialized' && accessType === 'file' ? filePath : '',
    file_expression: sourceType === 'serialized' && accessType === 'file' ? fileExpression : '',
    renderer_type: sourceType === 'serialized' ? effectiveRendererType : 'none',
    renderer_config: sourceType === 'serialized' ? rendererConfig : {},
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
          onValueChange={(v) => setTab(v as 'edit' | 'preview')}
          className="min-h-0 min-w-0 flex-1 gap-3"
        >
          <TabsList variant="line">
            <TabsTrigger value="edit">Edit</TabsTrigger>
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

            {!isLocal && (
              <RoleMultiSelect
                roles={roles}
                value={displayedRoleIds}
                onChange={setAllowedRoles}
                disabled={rolesLocked}
                collapsible
                helperText={
                  rolesLocked
                    ? `Inherited from connection "${effectiveConnection?.id}" -- edit its access roles to change this.`
                    : undefined
                }
              />
            )}

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

            {sourceType === 'serialized' && (
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
                rendererType={effectiveRendererType}
                rendererConfig={rendererConfig}
                onRendererChange={(t, c) => {
                  setRendererType(t)
                  setRendererConfig(c)
                }}
                body={body}
                onBodyChange={setBody}
                bodyOpen={bodyOpen}
                onBodyOpenChange={setBodyOpen}
              />
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
                  <div className="overflow-hidden rounded-lg border border-border">
                    <DataGrid table={paramTable} recordCount={paramRows.length} tableLayout={{ dense: true }}>
                      <DataGridContainer>
                        <DataGridTable />
                      </DataGridContainer>
                    </DataGrid>
                  </div>
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

          <TabsContent value="preview" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <DatastorePreviewPanel
              initialParams={Object.fromEntries(paramRows.map((r) => [r.variable, r.value]))}
              onRun={(params, limit) =>
                api.post<DatastorePreviewResult>('/datastores/preview-config/', { ...buildPayload(), params, limit })
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
