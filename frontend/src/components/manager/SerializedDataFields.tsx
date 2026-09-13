import { ChevronRight, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/Field'
import { cn } from '@/lib/utils'

import type { Datastore, RendererType } from '../../api/types'
import { RendererFields } from './RendererFields'

interface Option {
  value: string
  label: string
}

const ACCESS_TYPE_OPTIONS: { value: NonNullable<Datastore['access_type']>; label: string }[] = [
  { value: 'http', label: 'HTTP request' },
  { value: 's3', label: 'S3 bucket' },
  { value: 'file', label: 'File' },
]

const SERIALIZED_RENDERER_TYPES: RendererType[] = ['json', 'xml', 'delimited']

const h = 'h-8 text-[0.85em]'

interface Props {
  accessType: Datastore['access_type']
  onAccessTypeChange: (v: Datastore['access_type']) => void
  connectionOptions: Option[]
  connection: string
  onConnectionChange: (v: string) => void
  dataUrl: string
  onDataUrlChange: (v: string) => void
  requestMethod: Datastore['request_method']
  onRequestMethodChange: (v: Datastore['request_method']) => void
  requestParams: Record<string, string>
  onRequestParamsChange: (v: Record<string, string>) => void
  requestBody: string
  onRequestBodyChange: (v: string) => void
  objectKey: string
  onObjectKeyChange: (v: string) => void
  objectUrl: string
  onObjectUrlChange: (v: string) => void
  filePath: string
  onFilePathChange: (v: string) => void
  fileExpression: string
  onFileExpressionChange: (v: string) => void
  rendererType: RendererType
  rendererConfig: Record<string, unknown>
  onRendererChange: (rendererType: RendererType, config: Record<string, unknown>) => void
  body: string
  onBodyChange: (v: string) => void
  bodyOpen: boolean
  onBodyOpenChange: (v: boolean) => void
}

/**
 * source_type='serialized' (specs/serialized-datastore.md): fetches raw
 * content over HTTP/S3/File, then parses it with the shared Renderer
 * interface (JSON/XML/Delimited only -- no "None"/Fixed width, per the
 * spec's own "Processing Data" list). Split into "Accessing Data"/
 * "Processing Data" tabs as the spec explicitly asks for.
 */
export function SerializedDataFields(props: Props) {
  const {
    accessType, onAccessTypeChange, connectionOptions, connection, onConnectionChange,
    dataUrl, onDataUrlChange, requestMethod, onRequestMethodChange, requestParams, onRequestParamsChange,
    requestBody, onRequestBodyChange, objectKey, onObjectKeyChange, objectUrl, onObjectUrlChange,
    filePath, onFilePathChange, fileExpression, onFileExpressionChange,
    rendererType, rendererConfig, onRendererChange, body, onBodyChange, bodyOpen, onBodyOpenChange,
  } = props

  const paramRows = Object.entries(requestParams)

  const setParamKey = (i: number, key: string) => {
    const next = [...paramRows]
    next[i] = [key, next[i][1]]
    onRequestParamsChange(Object.fromEntries(next))
  }
  const setParamValue = (i: number, value: string) => {
    const next = [...paramRows]
    next[i] = [next[i][0], value]
    onRequestParamsChange(Object.fromEntries(next))
  }
  const removeParam = (i: number) => {
    onRequestParamsChange(Object.fromEntries(paramRows.filter((_, idx) => idx !== i)))
  }
  const addParam = () => {
    let i = paramRows.length + 1
    let key = `param${i}`
    while (key in requestParams) {
      i += 1
      key = `param${i}`
    }
    onRequestParamsChange({ ...requestParams, [key]: '' })
  }

  return (
    <Tabs defaultValue="access" className="gap-3">
      <TabsList variant="line">
        <TabsTrigger value="access">Accessing Data</TabsTrigger>
        <TabsTrigger value="process">Processing Data</TabsTrigger>
      </TabsList>

      <TabsContent value="access" className="flex flex-col gap-3">
        <Field label="Access type">
          <Select value={accessType || 'http'} onValueChange={(v) => onAccessTypeChange(v as Datastore['access_type'])}>
            <SelectTrigger className={cn(h, 'w-full')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {accessType === 'http' && (
          <>
            <Field label="HTTP connection" helperText="Optional -- leave unset for endpoints that don't require authorization">
              <Select value={connection} onValueChange={onConnectionChange}>
                <SelectTrigger className={cn(h, 'w-full')}>
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
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <Field label="Method">
                <Select value={requestMethod || 'GET'} onValueChange={(v) => onRequestMethodChange(v as Datastore['request_method'])}>
                  <SelectTrigger className={cn(h, 'w-full')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="URL" helperText="Supports ${param}">
                <Input value={dataUrl} onChange={(e) => onDataUrlChange(e.target.value)} className={cn(h, 'font-mono')} />
              </Field>
            </div>
            <div>
              <div className="mb-1 text-[0.78em] text-muted-foreground">Parameters (key/value, each value supports ${'{param}'})</div>
              <div className="flex flex-col gap-1">
                {paramRows.map(([key, value], i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Key"
                      value={key}
                      onChange={(e) => setParamKey(i, e.target.value)}
                      className={cn(h, 'w-[160px] font-mono')}
                    />
                    <Input
                      placeholder="Value"
                      value={value}
                      onChange={(e) => setParamValue(i, e.target.value)}
                      className={cn(h, 'flex-1 font-mono')}
                    />
                    <Button variant="ghost" size="icon-sm" onClick={() => removeParam(i)}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-fit" onClick={addParam}>
                  <Plus />
                  Add parameter
                </Button>
              </div>
            </div>
            {requestMethod === 'POST' && (
              <Field label="Raw request body" helperText="JSON, text, or XML. Supports ${param}">
                <Textarea rows={4} value={requestBody} onChange={(e) => onRequestBodyChange(e.target.value)} className="font-mono text-[0.85em]" />
              </Field>
            )}
          </>
        )}

        {accessType === 's3' && (
          <>
            <Field label="S3 connection">
              <Select value={connection} onValueChange={onConnectionChange}>
                <SelectTrigger className={cn(h, 'w-full')}>
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
            <Field label="Object key / path" helperText="Within the connection's configured bucket -- or a full s3:// URI. Supports ${param}">
              <Input value={objectKey} onChange={(e) => onObjectKeyChange(e.target.value)} className={cn(h, 'font-mono')} />
            </Field>
            <Field
              label="-- or -- Object URL"
              helperText="An s3:// URI, or the S3 console's own Object URL -- fetched via the connection's credentials when set. Supports ${param}"
            >
              <Input value={objectUrl} onChange={(e) => onObjectUrlChange(e.target.value)} className={cn(h, 'font-mono')} />
            </Field>
          </>
        )}

        {accessType === 'file' && (
          <>
            <Field label="Path" helperText="Directory on the server's own filesystem. Supports ${param}">
              <Input value={filePath} onChange={(e) => onFilePathChange(e.target.value)} className={cn(h, 'font-mono')} />
            </Field>
            <Field label="Filename or regex" helperText="An exact filename, or a regex matched against files in Path. Supports ${param}">
              <Input value={fileExpression} onChange={(e) => onFileExpressionChange(e.target.value)} className={cn(h, 'font-mono')} />
            </Field>
          </>
        )}
      </TabsContent>

      <TabsContent value="process" className="flex flex-col gap-3">
        <RendererFields
          rendererType={rendererType}
          config={rendererConfig}
          onChange={onRendererChange}
          allowedTypes={SERIALIZED_RENDERER_TYPES}
        />
        <button
          type="button"
          onClick={() => onBodyOpenChange(!bodyOpen)}
          className="flex items-center gap-1 self-start text-[0.8em] text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', bodyOpen && 'rotate-90')} />
          Body (test / troubleshooting override)
        </button>
        {bodyOpen && (
          <Field helperText="When set, this content is parsed directly instead of fetching from the configured access type. Supports ${param}">
            <Textarea rows={6} value={body} onChange={(e) => onBodyChange(e.target.value)} className="font-mono text-[0.85em]" />
          </Field>
        )}
      </TabsContent>
    </Tabs>
  )
}
