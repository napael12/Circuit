import { useMemo, useState } from 'react'
import { ChevronRight, Cloud, Database, Globe, Network } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/Field'
import { cn } from '@/lib/utils'

import { api } from '../../api/client'
import type { ConnectionTestResult, DataConnection, Role } from '../../api/types'
import { RoleMultiSelect } from './RoleMultiSelect'

type ConnType = DataConnection['type']

interface Props {
  /** null = creating a new connection. */
  initial: DataConnection | null
  roles: Role[]
  onClose: () => void
  onSaved: () => void
}

// specs/datastore-streamline.md: REST endpoint and File system were removed
// as creatable/editable connection types. 'rest' stays in ConnType (see
// DataConnection['type']'s own doc comment) purely so this dialog still
// type-checks/renders sensibly if it's ever handed a legacy connection whose
// stored type is still 'rest' -- it can never be picked here.
const TYPE_OPTIONS: { value: ConnType; label: string }[] = [
  { value: 'sql', label: 'SQL database' },
  { value: 's3', label: 'S3 bucket' },
]

export const CONNECTION_TYPE_ICONS: Record<ConnType, typeof Database> = {
  sql: Database,
  rest: Globe,
  s3: Cloud,
}

const SQL_DRIVER_PRESETS = [
  { value: 'postgresql+psycopg2', label: 'PostgreSQL (psycopg2)' },
  { value: 'mysql+pymysql', label: 'MySQL (pymysql)' },
  { value: 'mssql+pyodbc', label: 'MS SQL Server (pyodbc)' },
  { value: 'sqlite', label: 'SQLite' },
]
const CUSTOM_DRIVER = '__custom__'

/** "key=value" lines <-> object, used for the SQL "extra parameters" box. */
function parseKeyValueLines(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    if (key) result[key] = trimmed.slice(idx + 1).trim()
  }
  return result
}

function toKeyValueLines(obj: Record<string, unknown> | undefined): string {
  return Object.entries(obj ?? {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('\n')
}

const inputCls = 'h-8 text-[0.85em]'
const selectTriggerCls = 'h-8 w-full text-[0.85em]'

/**
 * Bespoke connection editor -- one visual layout per connections.models.
 * DataConnection type (specs/ui_connections/*.png: a driver combo + Host/Port
 * vs SQLAlchemy URL toggle for SQL, a plain field stack for S3), replacing
 * the old generic CrudTable+RecordDialog form. specs/datastore-streamline.md
 * removed REST endpoint and File system as connection types. See
 * backend/connections/backends.py for what each remaining type actually does
 * with these fields.
 */
export function ConnectionDialog({ initial, roles, onClose, onSaved }: Props) {
  const isEdit = initial !== null

  const [id, setId] = useState(initial?.id ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [type, setType] = useState<ConnType>(initial?.type ?? 'sql')
  const TypeIcon = CONNECTION_TYPE_ICONS[type]

  // --- SQL ---
  const [dialect, setDialect] = useState(initial?.dialect ?? 'postgresql+psycopg2')
  const [sqlMode, setSqlMode] = useState<'host' | 'url'>(initial?.url ? 'url' : 'host')
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(initial?.port != null ? String(initial.port) : '')
  const [database, setDatabase] = useState(initial?.database ?? '')
  const [sqlUrl, setSqlUrl] = useState(initial?.type === 'sql' ? (initial?.url ?? '') : '')
  const [optionsText, setOptionsText] = useState(toKeyValueLines(initial?.options))
  const [testQuery, setTestQuery] = useState((initial?.config?.test_query as string | undefined) ?? '')

  // --- shared SQL credentials ---
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState('')

  // --- S3 ---
  // access_key isn't secret-shaped (see SECRET_CONFIG_KEYS in the serializer), so
  // unlike secret_key it comes back from the API and can be pre-filled directly.
  const [accessKey, setAccessKey] = useState((initial?.config?.access_key as string | undefined) ?? '')
  const [secretKey, setSecretKey] = useState('')
  const [region, setRegion] = useState((initial?.config?.region as string | undefined) ?? '')
  const [bucket, setBucket] = useState((initial?.config?.bucket as string | undefined) ?? '')

  // --- common advanced ---
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [maxRows, setMaxRows] = useState(initial?.max_rows != null ? String(initial.max_rows) : '')
  const [timeoutSeconds, setTimeoutSeconds] = useState(String(initial?.timeout_seconds ?? 30))
  const [allowedRoles, setAllowedRoles] = useState<number[]>(initial?.allowed_roles ?? [])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)

  const needsCreds = type === 'sql'

  const driverSelectValue = useMemo(
    () => (SQL_DRIVER_PRESETS.some((p) => p.value === dialect) ? dialect : CUSTOM_DRIVER),
    [dialect],
  )

  function buildPayload(): Record<string, unknown> {
    const config: Record<string, unknown> = {}
    if (type === 'sql') {
      if (testQuery.trim()) config.test_query = testQuery.trim()
    } else if (type === 's3') {
      config.access_key = accessKey
      config.secret_key = secretKey
      config.region = region
      config.bucket = bucket
    }

    return {
      id,
      description,
      type,
      dialect: type === 'sql' ? dialect : '',
      host: type === 'sql' && sqlMode === 'host' ? host : '',
      port: type === 'sql' && sqlMode === 'host' && port !== '' ? Number(port) : null,
      database: type === 'sql' && sqlMode === 'host' ? database : '',
      options: type === 'sql' ? parseKeyValueLines(optionsText) : {},
      url: type === 'sql' && sqlMode === 'url' ? sqlUrl : '',
      username: needsCreds ? username : '',
      password: needsCreds ? password : '',
      config,
      max_rows: maxRows === '' ? null : Number(maxRows),
      timeout_seconds: timeoutSeconds === '' ? 30 : Number(timeoutSeconds),
      allowed_roles: allowedRoles,
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.post<ConnectionTestResult>('/connections/test-config/', buildPayload()))
    } catch (err) {
      setTestResult({ ok: false, message: String(err) })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.patch(`/connections/${id}/`, buildPayload())
      } else {
        await api.post('/connections/', buildPayload())
      }
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
          'flex h-[760px] max-h-[calc(100vh-4rem)] w-[760px] max-w-[calc(100vw-2rem)]',
          'min-h-[480px] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]',
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TypeIcon className="size-4" />
            </span>
            <span className="flex-1 truncate">{isEdit ? id : 'New Connection'}</span>
            {isEdit ? (
              <Badge variant="secondary" className="shrink-0 font-normal">
                {TYPE_OPTIONS.find((opt) => opt.value === type)?.label}
              </Badge>
            ) : (
              <Select value={type} onValueChange={(v) => setType(v as ConnType)}>
                <SelectTrigger className="h-7 w-[170px] shrink-0 text-[0.8em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-1 pr-1">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {testResult && (
            <Alert variant={testResult.ok ? 'default' : 'destructive'}>
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" helperText="Letters, numbers, hyphens/underscores">
              <Input value={id} disabled={isEdit} onChange={(e) => setId(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <RoleMultiSelect roles={roles} value={allowedRoles} onChange={setAllowedRoles} collapsible />

          <Separator />

          {type === 'sql' && (
            <>
              <Field label="Driver">
                <Select
                  value={driverSelectValue}
                  onValueChange={(v) => setDialect(v === CUSTOM_DRIVER ? '' : v)}
                >
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SQL_DRIVER_PRESETS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_DRIVER}>Custom / other...</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {driverSelectValue === CUSTOM_DRIVER && (
                <Field label="SQLAlchemy dialect" helperText="e.g. oracle+cx_oracle">
                  <Input value={dialect} onChange={(e) => setDialect(e.target.value)} className={cn(inputCls, 'font-mono')} />
                </Field>
              )}

              <Tabs value={sqlMode} onValueChange={(v) => setSqlMode(v as 'host' | 'url')}>
                <TabsList className="w-full">
                  <TabsTrigger value="host" className="flex-1">
                    Host / Port
                  </TabsTrigger>
                  <TabsTrigger value="url" className="flex-1">
                    SQLAlchemy URL
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {sqlMode === 'host' ? (
                <>
                  <div className="grid grid-cols-[1fr_120px] gap-3">
                    <Field label="Host">
                      <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" className={inputCls} />
                    </Field>
                    <Field label="Port">
                      <Input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="5432"
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <Field label="Database name">
                    <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="my_database" className={inputCls} />
                  </Field>
                </>
              ) : (
                <Field label="Connection URL" helperText="e.g. postgresql+psycopg2://user:pass@host:5432/mydb">
                  <Input
                    value={sqlUrl}
                    onChange={(e) => setSqlUrl(e.target.value)}
                    placeholder="postgresql://user:pass@localhost:5432/mydb"
                    className={cn(inputCls, 'font-mono')}
                  />
                </Field>
              )}

              <Field label="Extra parameters" helperText="key=value, one per line -- SQLAlchemy URL query params">
                <Textarea
                  rows={2}
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder={'pool_size=5\necho=true'}
                  className="font-mono text-[0.85em]"
                />
              </Field>

              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username">
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className={inputCls} />
                </Field>
                <Field label="Password" helperText={isEdit ? 'Leave blank to keep the saved password' : undefined}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}

          {type === 's3' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Access key">
                  <Input value={accessKey} onChange={(e) => setAccessKey(e.target.value)} className={cn(inputCls, 'font-mono')} />
                </Field>
                <Field label="Secret key" helperText={isEdit ? 'Leave blank to keep the saved value' : undefined}>
                  <Input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <p className="text-[0.78em] text-muted-foreground">
                Leave Access key and Secret key blank for anonymous access to a public bucket.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Region">
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="us-east-1" className={inputCls} />
                </Field>
                <Field label="Bucket" helperText="Optional -- used by Test connection">
                  <Input value={bucket} onChange={(e) => setBucket(e.target.value)} className={inputCls} />
                </Field>
              </div>
            </>
          )}

          <Separator />

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1 self-start text-[0.8em] text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-90')} />
            Advanced connection options
          </button>
          {advancedOpen && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Field label="Max rows" helperText="Blank = unlimited">
                <Input type="number" value={maxRows} onChange={(e) => setMaxRows(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Timeout (seconds)">
                <Input
                  type="number"
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(e.target.value)}
                  className={inputCls}
                />
              </Field>
              {type === 'sql' && (
                <Field label="Test query" helperText="Optional -- defaults to SELECT 1" className="col-span-2">
                  <Input value={testQuery} onChange={(e) => setTestQuery(e.target.value)} className={cn(inputCls, 'font-mono')} />
                </Field>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing}>
            <Network />
            Test connection
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {isEdit ? 'Save' : 'Connect'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
