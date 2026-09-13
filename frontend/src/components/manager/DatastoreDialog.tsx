import { useMemo, useState } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
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
import type { ActionDef, DataConnection, Datastore, DatastorePreviewResult, RendererType, Role } from '../../api/types'
import { discoverAllParams } from '../../utils/sqlParams'
import { RoleMultiSelect } from './RoleMultiSelect'
import { DatastorePreviewPanel } from './DatastorePreviewPanel'
import { RendererFields } from './RendererFields'

interface Option {
  value: string
  label: string
}

interface Props {
  /** null = creating a new datastore. */
  initial: Datastore | null
  connections: DataConnection[]
  actions: ActionDef[]
  actionOptions: Option[]
  roles: Role[]
  initialTab?: 'edit' | 'preview'
  onClose: () => void
  onSaved: () => void
}

interface ParamRow {
  variable: string
  value: string
  /** Found live in the query/config text -- its name isn't editable (renaming here wouldn't rename it there). */
  discovered: boolean
}

// A Datasource's source_type is built on a matching connections.models.
// DataConnection type -- see backend/connections/backends.py and
// specs/datasource_enhancements.md. source_type=action has no connection
// picker of its own here: the connection lives on the selected Action.
// specs/datastore-streamline.md removed source_type=file entirely (File
// system connections no longer exist).
const CONNECTION_TYPE_FOR_SOURCE: Partial<Record<Datastore['source_type'], DataConnection['type']>> = {
  query: 'sql',
  s3: 's3',
  json: 'rest',
}

const SOURCE_TYPE_OPTIONS: { value: Datastore['source_type']; label: string }[] = [
  { value: 'query', label: 'SQL query' },
  { value: 'action', label: 'REST (Action)' },
  { value: 's3', label: 'S3 object' },
  { value: 'json', label: 'JSON' },
]

/**
 * Global (Manager-managed) datastore editor -- one of SQL/REST/S3
 * (specs/datasource_enhancements.md), each with its own type-specific
 * fields and, for REST/S3, a Renderer (see RendererFields). :name /
 * ${name} variables are derived live from whichever fields are relevant to
 * the current type and edited as default values in a data grid. Edit/
 * Preview share one dialog via tabs instead of Preview opening a second
 * modal.
 */
export function DatastoreDialog({ initial, connections, actions, actionOptions, roles, initialTab = 'edit', onClose, onSaved }: Props) {
  const isEdit = initial !== null
  const [tab, setTab] = useState<'edit' | 'preview'>(initialTab)
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [sourceType, setSourceType] = useState<Datastore['source_type']>(initial?.source_type ?? 'query')
  const [connection, setConnection] = useState(initial?.connection ?? '')
  const [inlineSql, setInlineSql] = useState(initial?.inline_sql ?? '')
  const [rowLimit, setRowLimit] = useState<number | ''>(initial?.row_limit ?? '')
  const [actionId, setActionId] = useState(initial?.action ?? '')
  const [objectKey, setObjectKey] = useState(initial?.object_key ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [dataUrl, setDataUrl] = useState(initial?.data_url ?? '')
  const [jsonRootPath, setJsonRootPath] = useState(initial?.json_root_path ?? '')
  const [rendererType, setRendererType] = useState<RendererType>(initial?.renderer_type ?? 'none')
  const [rendererConfig, setRendererConfig] = useState<Record<string, unknown>>(initial?.renderer_config ?? {})
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
    const type = CONNECTION_TYPE_FOR_SOURCE[sourceType]
    if (!type) return []
    return connections.filter((c) => c.type === type).map((c) => ({ value: c.id, label: c.id }))
  }, [connections, sourceType])

  const selectedAction = useMemo(() => actions.find((a) => a.id === actionId), [actions, actionId])

  // specs/permissions.md #2a: a restricted connection's roles cascade to any
  // datastore built on it -- mirrors backend/datastore/roles.py so the
  // picker never shows a value the save would silently override.
  const effectiveConnection = useMemo(() => {
    const connId = sourceType === 'action' ? selectedAction?.connection : connection
    return connections.find((c) => c.id === connId) ?? null
  }, [connections, connection, selectedAction, sourceType])
  const inheritedRoleIds = effectiveConnection?.allowed_roles ?? []
  const rolesLocked = inheritedRoleIds.length > 0
  const displayedRoleIds = rolesLocked ? inheritedRoleIds : allowedRoles

  const discoveredParamNames = useMemo(() => {
    const sources = [
      inlineSql,
      objectKey,
      body,
      dataUrl,
      jsonRootPath,
      JSON.stringify(rendererConfig),
      selectedAction?.url,
      selectedAction?.path,
      selectedAction?.request_body,
      selectedAction ? JSON.stringify(selectedAction.headers) : undefined,
    ]
    return new Set(discoverAllParams(...sources))
  }, [inlineSql, objectKey, body, dataUrl, jsonRootPath, rendererConfig, selectedAction])

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
    name,
    source_type: sourceType,
    connection: sourceType === 'action' ? null : connection || null,
    sql_def: null,
    inline_sql: sourceType === 'query' ? inlineSql : '',
    row_limit: rowLimit === '' ? null : rowLimit,
    action: sourceType === 'action' ? actionId || null : null,
    object_key: sourceType === 's3' ? objectKey : '',
    body: sourceType === 'json' ? body : '',
    data_url: sourceType === 'json' ? dataUrl : '',
    json_root_path: sourceType === 'json' ? jsonRootPath : '',
    renderer_type: sourceType === 'query' || sourceType === 'json' ? 'none' : rendererType,
    renderer_config: sourceType === 'query' || sourceType === 'json' ? {} : rendererConfig,
    default_params: defaultParams,
    // Push is only ever meaningful for source_type=json (enforced again
    // server-side in DatastoreSerializer.validate) -- force back to 'none'
    // if the type was changed away from json while Push was selected.
    api_mode: apiMode === 'push' && sourceType !== 'json' ? 'none' : apiMode,
    refresh_mode: refreshMode,
    cron_schedule: cronSchedule,
    idle_timeout_seconds: refreshMode === 'scheduled' ? (idleTimeoutSeconds === '' ? null : idleTimeoutSeconds) : null,
    // Sent as-is when unrestricted; the backend forces this to the
    // effective connection's roles whenever that connection is restricted
    // (datastore.roles.apply_cascaded_roles), same as rolesLocked below.
    allowed_roles: allowedRoles,
  })

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.patch(`/datastores/${id}/`, buildPayload())
      } else {
        await api.post('/datastores/', buildPayload())
      }
      toast.success('Saved.')
      onSaved()
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
            <span className="flex-1 truncate">{isEdit ? id : 'New Datastore'}</span>
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
            {!isEdit && (
              <Field label="Id">
                <Input value={id} onChange={(e) => setId(e.target.value)} className="h-8 text-[0.85em]" />
              </Field>
            )}
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[0.85em]" />
              </Field>
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
              {sourceType === 'action' && (
                <Field label="Action" helperText="Manage its data URL, request body, and headers in the Actions tab">
                  <Select value={actionId} onValueChange={setActionId}>
                    <SelectTrigger className="h-8 w-full text-[0.85em]">
                      <SelectValue placeholder="none" />
                    </SelectTrigger>
                    <SelectContent>
                      {actionOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {sourceType === 's3' && (
                <Field label="S3 connection">
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
              {sourceType === 'json' && (
                <Field label="REST connection" helperText="Optional -- leave unset to use Body directly">
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

            {sourceType === 's3' && (
              <Field label="Object key / path" helperText="Within the connection's configured bucket. Supports ${param}">
                <Input
                  value={objectKey}
                  onChange={(e) => setObjectKey(e.target.value)}
                  className="font-mono h-8 text-[0.85em]"
                />
              </Field>
            )}

            {sourceType === 'json' && connection && (
              <Field label="Data URL" helperText="Endpoint to GET the JSON body from, appended to the connection's URL. Supports ${param}">
                <Input value={dataUrl} onChange={(e) => setDataUrl(e.target.value)} className="font-mono h-8 text-[0.85em]" />
              </Field>
            )}

            {sourceType === 'json' && !connection && (
              <Field label="Body" helperText='JSON text, or a bare ${param} to pass the body in as a parameter. Supports ${param}'>
                <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[0.85em]" />
              </Field>
            )}

            {sourceType === 'json' && (
              <Field label="Root JSON Path" helperText='Optional JsonPath selecting the row(s), e.g. $.phoneNumbers[*] -- defaults to "$" (the whole document)'>
                <Input
                  value={jsonRootPath}
                  onChange={(e) => setJsonRootPath(e.target.value)}
                  className="font-mono h-8 text-[0.85em]"
                />
              </Field>
            )}

            {sourceType !== 'query' && sourceType !== 'json' && (
              <RendererFields
                rendererType={rendererType}
                config={rendererConfig}
                onChange={(t, c) => {
                  setRendererType(t)
                  setRendererConfig(c)
                }}
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
            <Field
              label="API mode"
              helperText={
                apiMode === 'push'
                  ? 'Refresh mode is ignored while Push is enabled -- data arrives via the push API call instead.'
                  : 'specs/api_datastore.md: exposes this datastore through the public, API-key-authenticated pull/push endpoints.'
              }
            >
              <Select value={apiMode} onValueChange={(v) => setApiMode(v as Datastore['api_mode'])}>
                <SelectTrigger className="h-8 w-full text-[0.85em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Disabled</SelectItem>
                  <SelectItem value="pull">Pull</SelectItem>
                  <SelectItem value="push" disabled={sourceType !== 'json'}>
                    Push{sourceType !== 'json' ? ' (JSON datastores only)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
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
              name={name || id}
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
