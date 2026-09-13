import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/Field'

import { api } from '../../api/client'
import type { ActionDef, DataConnection, DatastorePreviewResult, PanelDatastoreRef, RendererType } from '../../api/types'
import { discoverAllParams } from '../../utils/sqlParams'
import { DatastorePreviewDialog } from '../manager/DatastorePreviewDialog'
import { RendererFields } from '../manager/RendererFields'
import { newId } from './panelTree'

interface Option {
  value: string
  label: string
}

interface Props {
  /** null = adding a new reference. */
  initial: PanelDatastoreRef | null
  globalDatastoreIds: string[]
  connections: DataConnection[]
  actions: ActionDef[]
  actionOptions: Option[]
  onClose: () => void
  onSave: (ref: PanelDatastoreRef) => void
}

// specs/datastore-streamline.md removed source_type=file entirely (File
// system connections no longer exist).
const CONNECTION_TYPE_FOR_SOURCE: Partial<Record<NonNullable<PanelDatastoreRef['source_type']>, DataConnection['type']>> = {
  query: 'sql',
  s3: 's3',
  json: 'rest',
}

/**
 * Adding (or editing) one of this panel's datastores.models.Datastore
 * references (specs/panel_design.md: "present a dialog to either select
 * existing datastores or create 'Local' Datastore"). Existing = a shared
 * global Datastore, referenced by id. Local = the same field set as a
 * global Datastore, embedded directly in this panel's own JSON -- always
 * on-demand (see api/types.ts's PanelDatastoreRef doc comment).
 */
export function DatastoreRefDialog({ initial, globalDatastoreIds, connections, actions, actionOptions, onClose, onSave }: Props) {
  const [tab, setTab] = useState<'existing' | 'local'>(initial?.scope === 'local' ? 'local' : 'existing')
  const [globalName, setGlobalName] = useState(initial?.scope === 'global' ? initial.name : '')

  const [localName, setLocalName] = useState(initial?.scope === 'local' ? initial.name : '')
  const [sourceType, setSourceType] = useState<NonNullable<PanelDatastoreRef['source_type']>>(
    (initial?.scope === 'local' && initial.source_type) || 'query',
  )
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
  const [defaultParams, setDefaultParams] = useState<Record<string, string>>(initial?.default_params ?? {})
  const [paramsText, setParamsText] = useState(() => JSON.stringify(initial?.default_params ?? {}, null, 2))
  const [paramsError, setParamsError] = useState(false)

  const [preview, setPreview] = useState(false)

  const connectionOptions = useMemo<Option[]>(() => {
    const type = CONNECTION_TYPE_FOR_SOURCE[sourceType]
    if (!type) return []
    return connections.filter((c) => c.type === type).map((c) => ({ value: c.id, label: c.id }))
  }, [connections, sourceType])

  const localConfig = {
    source_type: sourceType,
    connection,
    inline_sql: inlineSql,
    row_limit: rowLimit === '' ? undefined : rowLimit,
    action: actionId,
    object_key: objectKey,
    body,
    data_url: dataUrl,
    json_root_path: jsonRootPath,
    renderer_type: rendererType,
    renderer_config: rendererConfig,
    default_params: defaultParams,
  }

  const buildRef = (): PanelDatastoreRef =>
    tab === 'existing'
      ? { id: initial?.id ?? newId('ds'), name: globalName, scope: 'global' }
      : { id: initial?.id ?? newId('ds'), name: localName, scope: 'local', ...localConfig }

  const canSave = tab === 'existing' ? !!globalName : !!localName

  const selectedAction = actions.find((a) => a.id === actionId)
  const previewParams = useMemo(() => {
    const names = discoverAllParams(
      inlineSql,
      objectKey,
      body,
      dataUrl,
      jsonRootPath,
      JSON.stringify(rendererConfig ?? {}),
      selectedAction?.path,
      selectedAction?.url,
      JSON.stringify(selectedAction?.headers ?? {}),
    )
    const all = new Set([...names, ...Object.keys(defaultParams)])
    return Object.fromEntries(Array.from(all).map((n) => [n, defaultParams[n] ?? '']))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineSql, objectKey, body, dataUrl, jsonRootPath, rendererConfig, selectedAction, defaultParams])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit datastore' : 'Add datastore'}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'existing' | 'local')}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">
              Select existing
            </TabsTrigger>
            <TabsTrigger value="local" className="flex-1">
              Create local
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="flex flex-col gap-3 pt-2">
            <Field label="Global datastore">
              <Select value={globalName} onValueChange={setGlobalName}>
                <SelectTrigger className="h-8 w-full text-[0.85em]">
                  <SelectValue placeholder="none" />
                </SelectTrigger>
                <SelectContent>
                  {globalDatastoreIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </TabsContent>

          <TabsContent value="local" className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pt-2">
            <Field label="Name" helperText="How components on this panel reference it">
              <Input value={localName} onChange={(e) => setLocalName(e.target.value)} className="h-8 text-[0.85em]" />
            </Field>
            <Field label="Source">
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as typeof sourceType)}>
                <SelectTrigger className="h-8 w-full text-[0.85em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="query">SQL query</SelectItem>
                  <SelectItem value="action">Action (REST)</SelectItem>
                  <SelectItem value="s3">S3 object</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {sourceType === 'query' && (
              <>
                <Field label="Connection">
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
                <Field label="SQL" helperText="Use :paramname bind variables, or ${paramname} to substitute directly">
                  <Textarea rows={3} value={inlineSql} onChange={(e) => setInlineSql(e.target.value)} className="font-mono text-[0.85em]" />
                </Field>
                <Field label="Row limit">
                  <Input
                    type="number"
                    value={rowLimit}
                    onChange={(e) => setRowLimit(e.target.value === '' ? '' : Number(e.target.value))}
                    className="h-8 text-[0.85em]"
                  />
                </Field>
              </>
            )}

            {sourceType === 'action' && (
              <Field label="Action">
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
              <>
                <Field label="Connection">
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
                <Field label="Object key / path" helperText="Supports ${param}">
                  <Input value={objectKey} onChange={(e) => setObjectKey(e.target.value)} className="h-8 font-mono text-[0.85em]" />
                </Field>
              </>
            )}

            {sourceType === 'json' && (
              <>
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
                {connection ? (
                  <Field label="Data URL" helperText="Appended to the connection's URL. Supports ${param}">
                    <Input value={dataUrl} onChange={(e) => setDataUrl(e.target.value)} className="h-8 font-mono text-[0.85em]" />
                  </Field>
                ) : (
                  <Field label="Body" helperText='JSON text, or a bare ${param} to pass the body in as a parameter'>
                    <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-[0.85em]" />
                  </Field>
                )}
                <Field label="Root JSON Path" helperText='Optional JsonPath, e.g. $.phoneNumbers[*] -- defaults to "$"'>
                  <Input
                    value={jsonRootPath}
                    onChange={(e) => setJsonRootPath(e.target.value)}
                    className="h-8 font-mono text-[0.85em]"
                  />
                </Field>
              </>
            )}

            {sourceType !== 'query' && sourceType !== 'json' && (
              <RendererFields
                compact
                rendererType={rendererType}
                config={rendererConfig}
                onChange={(t: RendererType, c) => {
                  setRendererType(t)
                  setRendererConfig(c)
                }}
              />
            )}

            <Field label="Default params" error={paramsError} helperText={paramsError ? 'Invalid JSON' : '{"paramName": "value"}'}>
              <Textarea
                rows={2}
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
                onBlur={() => {
                  try {
                    setDefaultParams(JSON.parse(paramsText || '{}'))
                    setParamsError(false)
                  } catch {
                    setParamsError(true)
                  }
                }}
                className="text-[0.85em]"
              />
            </Field>
          </TabsContent>
        </Tabs>

        <DialogFooter className="items-center sm:justify-between">
          {tab === 'local' ? (
            <Button variant="ghost" size="sm" onClick={() => setPreview(true)}>
              Test
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canSave} onClick={() => onSave(buildRef())}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {preview && (
        <DatastorePreviewDialog
          title={localName || 'local datastore'}
          initialParams={previewParams}
          onRun={(params, limit) => api.post<DatastorePreviewResult>('/datastores/preview-config/', { ...localConfig, params, limit })}
          onClose={() => setPreview(false)}
        />
      )}
    </Dialog>
  )
}
