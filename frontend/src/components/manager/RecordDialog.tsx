import { useEffect, useState } from 'react'
import { ChevronRight, Network, Play } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/Field'
import { cn } from '@/lib/utils'

import type { ConnectionTestResult } from '../../api/types'
import type { FormField } from './formFields'

/** Dot-path read, e.g. getPath(values, "config.access_key"). */
function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj)
}

/** Dot-path immutable write, creating intermediate objects as needed. */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split('.')
  if (rest.length === 0) return { ...obj, [head]: value }
  const child = (obj[head] as Record<string, unknown> | undefined) ?? {}
  return { ...obj, [head]: setPath(child, rest.join('.'), value) }
}

/** Pairs up consecutive `half`-marked fields into two-column rows; everything else is its own single-field row. */
function groupFieldRows(fields: FormField[]): FormField[][] {
  const rows: FormField[][] = []
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    const next = fields[i + 1]
    if (field.half && next?.half) {
      rows.push([field, next])
      i++
    } else {
      rows.push([field])
    }
  }
  return rows
}

interface Props {
  title: string
  fields: FormField[]
  initial: Record<string, unknown> | null
  onClose: () => void
  onSave: (record: Record<string, unknown>) => Promise<void>
  /** When provided, shows a "Test connection" button that tries the in-progress (unsaved) field values. */
  onTest?: (record: Record<string, unknown>) => Promise<ConnectionTestResult>
  /** When provided, shows a "Preview" button; the caller owns the actual preview UI. */
  onPreview?: (record: Record<string, unknown>) => void
  /** Overrides the dialog's default width (sm:max-w-md) for forms with more fields. */
  dialogClassName?: string
}

export function RecordDialog({ title, fields, initial, onClose, onSave, onTest, onPreview, dialogClassName }: Props) {
  const isEdit = initial !== null
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [jsonText, setJsonText] = useState<Record<string, string>>({})
  const [jsonError, setJsonError] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)

  useEffect(() => {
    const base = initial ?? {}
    setValues(base)
    setJsonText(
      Object.fromEntries(
        fields.filter((f) => f.type === 'json').map((f) => [f.key, JSON.stringify(getPath(base, f.key) ?? {}, null, 2)]),
      ),
    )
    setJsonError({})
    setTestResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const set = (key: string, value: unknown) => setValues((v) => setPath(v, key, value))
  const visibleFields = fields.filter((f) => !f.showIf || f.showIf(values))

  const handleTest = async () => {
    if (!onTest) return
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await onTest(values))
    } catch (err) {
      setTestResult({ ok: false, message: String(err) })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (Object.values(jsonError).some(Boolean)) return
    setSaving(true)
    setError(null)
    try {
      await onSave(values)
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  function renderField(field: FormField) {
    const disabled = isEdit && field.fixedOnEdit
    if (field.type === 'select') {
      return (
        <Field key={field.key} label={field.label} helperText={field.help}>
          <Select value={(getPath(values, field.key) as string) ?? ''} onValueChange={(v) => set(field.key, v)} disabled={disabled}>
            <SelectTrigger className="h-8 w-full text-[0.85em]">
              <SelectValue placeholder="none" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )
    }
    if (field.type === 'checkbox') {
      return (
        <label key={field.key} className="flex items-center gap-2 text-[0.85em]">
          <Checkbox checked={!!getPath(values, field.key)} onCheckedChange={(checked) => set(field.key, !!checked)} disabled={disabled} />
          {field.label}
        </label>
      )
    }
    if (field.type === 'multiselect') {
      const selected = ((getPath(values, field.key) as (string | number)[] | undefined) ?? []).map(String)
      // Fixed to ~4 rows regardless of option count, rather than
      // shrinking to fit -- scrolls internally past that.
      const list = (
        <div className="flex h-32 flex-col gap-1 overflow-y-auto rounded-lg border border-input p-2">
          {field.options?.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-[0.85em]">
              <Checkbox
                checked={selected.includes(opt.value)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  set(field.key, checked ? [...selected, opt.value] : selected.filter((v) => v !== opt.value))
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
      )
      if (!field.collapsible) {
        return (
          <Field key={field.key} label={field.label} helperText={field.help}>
            {list}
          </Field>
        )
      }
      return (
        <Collapsible key={field.key} defaultOpen={selected.length > 0}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[0.78em] font-normal text-muted-foreground [&[data-state=open]>svg]:rotate-90">
            <ChevronRight className="size-3.5 shrink-0 transition-transform" />
            {field.label}
            <span className="ml-auto text-[0.78em] text-muted-foreground/70">
              {selected.length === 0 ? 'None' : `${selected.length} selected`}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1 pt-1.5">
            {list}
            {field.help && <span className="text-[0.72em] text-muted-foreground">{field.help}</span>}
          </CollapsibleContent>
        </Collapsible>
      )
    }
    if (field.type === 'textarea') {
      return (
        <Field key={field.key} label={field.label} helperText={field.help}>
          <Textarea
            rows={3}
            disabled={disabled}
            value={(getPath(values, field.key) as string) ?? ''}
            onChange={(e) => set(field.key, e.target.value)}
            className="text-[0.85em]"
          />
        </Field>
      )
    }
    if (field.type === 'json') {
      return (
        <Field key={field.key} label={field.label} error={jsonError[field.key]} helperText={jsonError[field.key] ? 'Invalid JSON' : field.help}>
          <Textarea
            rows={2}
            disabled={disabled}
            value={jsonText[field.key] ?? ''}
            onChange={(e) => setJsonText((t) => ({ ...t, [field.key]: e.target.value }))}
            onBlur={() => {
              try {
                set(field.key, JSON.parse(jsonText[field.key] || '{}'))
                setJsonError((err) => ({ ...err, [field.key]: false }))
              } catch {
                setJsonError((err) => ({ ...err, [field.key]: true }))
              }
            }}
            className="text-[0.85em]"
          />
        </Field>
      )
    }
    return (
      <Field key={field.key} label={field.label} helperText={field.help}>
        <Input
          type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
          disabled={disabled}
          value={(getPath(values, field.key) as string | number) ?? ''}
          onChange={(e) => set(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
          className="h-8 text-[0.85em]"
        />
      </Field>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn('sm:max-w-md', dialogClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
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
          {groupFieldRows(visibleFields).map((row) =>
            row.length === 1 ? (
              renderField(row[0])
            ) : (
              <div key={row.map((f) => f.key).join('+')} className="grid grid-cols-2 gap-3">
                {row.map((field) => renderField(field))}
              </div>
            ),
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex gap-2">
            {onTest && (
              <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing}>
                <Network />
                Test connection
              </Button>
            )}
            {onPreview && (
              <Button variant="ghost" size="sm" onClick={() => onPreview(values)}>
                <Play />
                Preview
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
